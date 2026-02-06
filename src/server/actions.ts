import { Cause, Effect, Exit, Option } from "effect";
import type { EffectRuntime } from "../internal/runtimeContext";
import type { ErrorTransportCodec } from "./errors";

export interface ServerAction<Name extends string, Input, Output, E, R = never> {
  readonly name: Name;
  readonly inputSchema?: InputSchema<Input>;
  readonly errorCodec?: ErrorTransportCodec<E>;
  run(input: Input): Effect.Effect<Output, E, R>;
}

export type AnyServerAction = ServerAction<string, unknown, unknown, unknown, unknown>;

export type ServerActionInput<TAction extends AnyServerAction> =
  TAction extends ServerAction<string, infer Input, unknown, unknown, unknown> ? Input : never;

export type ServerActionOutput<TAction extends AnyServerAction> =
  TAction extends ServerAction<string, unknown, infer Output, unknown, unknown> ? Output : never;

export type ServerActionError<TAction extends AnyServerAction> =
  TAction extends ServerAction<string, unknown, unknown, infer E, unknown> ? E : never;

export interface InputSchema<T> {
  readonly validate: (input: unknown) => InputSchemaResult<T>;
}

export type InputSchemaResult<T> =
  | { readonly _tag: "success"; readonly value: T }
  | { readonly _tag: "failure"; readonly field: string; readonly message: string };

export interface DefineServerActionOptions<Name extends string, Input, Output, E, R> {
  readonly name: Name;
  readonly run: (input: Input) => Effect.Effect<Output, E, R>;
  readonly inputSchema?: InputSchema<Input>;
  readonly errorCodec?: ErrorTransportCodec<E>;
}

export const defineServerAction = <Name extends string, Input, Output, E, R = never>(
  options: DefineServerActionOptions<Name, Input, Output, E, R>,
): ServerAction<Name, Input, Output, E, R> => {
  const base: Pick<ServerAction<Name, Input, Output, E, R>, "name" | "run"> = {
    name: options.name,
    run: options.run,
  };
  if (options.inputSchema !== undefined && options.errorCodec !== undefined) {
    return { ...base, inputSchema: options.inputSchema, errorCodec: options.errorCodec };
  }
  if (options.inputSchema !== undefined) {
    return { ...base, inputSchema: options.inputSchema };
  }
  if (options.errorCodec !== undefined) {
    return { ...base, errorCodec: options.errorCodec };
  }
  return base as ServerAction<Name, Input, Output, E, R>;
};

export type ServerActionWireResult<Output, E> =
  | {
      readonly _tag: "success";
      readonly value: Output;
    }
  | {
      readonly _tag: "failure";
      readonly error: E;
    }
  | {
      readonly _tag: "defect";
      readonly message: string;
    }
  | {
      readonly _tag: "validation";
      readonly field: string;
      readonly message: string;
    };

export class ServerActionTransportError extends Error {
  constructor(
    message: string,
    readonly causeValue: unknown,
  ) {
    super(message);
    this.name = "ServerActionTransportError";
  }
}

export class ServerActionDefectError extends Error {
  constructor(readonly messageValue: string) {
    super(messageValue);
    this.name = "ServerActionDefectError";
  }
}

export class ServerActionValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ServerActionValidationError";
    this.field = field;
  }
}

export interface ServerActionTransport {
  readonly call: <Output, E>(
    name: string,
    input: unknown,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<ServerActionWireResult<Output, E>>;
}

export const callServerActionByName = <Output, E>(
  transport: ServerActionTransport,
  name: string,
  input: unknown,
  options?: { readonly signal?: AbortSignal },
  errorCodec?: ErrorTransportCodec<E>,
): Effect.Effect<
  Output,
  E | ServerActionTransportError | ServerActionDefectError | ServerActionValidationError,
  never
> => {
  const wireEffect = Effect.tryPromise({
    try: () => transport.call<Output, E>(name, input, options),
    catch: (cause) =>
      new ServerActionTransportError(`Server action transport failed for "${name}"`, cause),
  });

  return Effect.flatMap(
    wireEffect,
    (
      result,
    ): Effect.Effect<Output, E | ServerActionDefectError | ServerActionValidationError, never> => {
      if (result._tag === "success") {
        return Effect.succeed(result.value);
      }
      if (result._tag === "failure") {
        if (errorCodec !== undefined) {
          return Effect.fail(errorCodec.decode(result.error) as E);
        }
        return Effect.fail(result.error as E);
      }
      if (result._tag === "validation") {
        return Effect.fail(new ServerActionValidationError(result.field, result.message));
      }
      return Effect.fail(new ServerActionDefectError(result.message));
    },
  );
};

export const callServerAction = <TAction extends AnyServerAction>(
  transport: ServerActionTransport,
  action: TAction,
  input: ServerActionInput<TAction>,
  options?: { readonly signal?: AbortSignal },
): Effect.Effect<
  ServerActionOutput<TAction>,
  | ServerActionError<TAction>
  | ServerActionTransportError
  | ServerActionDefectError
  | ServerActionValidationError,
  never
> =>
  callServerActionByName<ServerActionOutput<TAction>, ServerActionError<TAction>>(
    transport,
    action.name,
    input,
    options,
    action.errorCodec as ErrorTransportCodec<ServerActionError<TAction>> | undefined,
  );

export interface ServerActionDispatchRequest {
  readonly name: string;
  readonly input: unknown;
  readonly signal?: AbortSignal;
}

export interface ServerActionDispatcher {
  readonly dispatchEffect: <Output, E>(
    request: ServerActionDispatchRequest,
  ) => Effect.Effect<ServerActionWireResult<Output, E>, never, never>;
  readonly dispatch: <Output, E>(
    request: ServerActionDispatchRequest,
  ) => Promise<ServerActionWireResult<Output, E>>;
}

const toServerActionWireResult = <Output, E>(
  exit: Exit.Exit<Output, E>,
  errorCodec?: ErrorTransportCodec<E>,
): ServerActionWireResult<Output, E> => {
  if (Exit.isSuccess(exit)) {
    return {
      _tag: "success",
      value: exit.value,
    };
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    const error = errorCodec !== undefined ? errorCodec.encode(failure.value) : failure.value;
    return {
      _tag: "failure",
      error: error as E,
    };
  }

  return {
    _tag: "defect",
    message: Cause.pretty(exit.cause),
  };
};

export const runServerActionEffectValue = <Output, E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<Output, E, never>,
  errorCodec?: ErrorTransportCodec<E>,
  signal?: AbortSignal,
): Effect.Effect<ServerActionWireResult<Output, E>, never, never> => {
  const runOptions = signal === undefined ? undefined : { signal };
  const scoped = Effect.scoped(effect);

  return Effect.match(
    Effect.tryPromise({
      try: () => runtime.runPromiseExit(scoped, runOptions),
      catch: (cause) =>
        ({
          _tag: "defect" as const,
          message: Cause.pretty(Cause.die(cause)),
        }) satisfies ServerActionWireResult<Output, E>,
    }),
    {
      onFailure: (result) => result,
      onSuccess: (exit) => toServerActionWireResult(exit, errorCodec),
    },
  );
};

export const runServerActionEffect = <Output, E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<Output, E, never>,
  errorCodec?: ErrorTransportCodec<E>,
  signal?: AbortSignal,
): Promise<ServerActionWireResult<Output, E>> =>
  Effect.runPromise(runServerActionEffectValue(runtime, effect, errorCodec, signal));

export const createServerActionDispatcher = (
  runtime: EffectRuntime,
  actions: readonly AnyServerAction[],
): ServerActionDispatcher => {
  const actionMap = new Map(actions.map((action) => [action.name, action] as const));

  const executeActionRunEffect = <Output, E>(
    action: AnyServerAction,
    input: unknown,
    signal?: AbortSignal,
  ): Effect.Effect<ServerActionWireResult<Output, E>, never, never> =>
    runServerActionEffectValue(
      runtime,
      action.run(input) as Effect.Effect<Output, E, never>,
      action.errorCodec as ErrorTransportCodec<E> | undefined,
      signal,
    );

  const dispatchEffect = <Output, E>(
    request: ServerActionDispatchRequest,
  ): Effect.Effect<ServerActionWireResult<Output, E>, never, never> =>
    Effect.gen(function* () {
      const action = actionMap.get(request.name);
      if (action === undefined) {
        return {
          _tag: "defect",
          message: `Unknown server action: ${request.name}`,
        };
      }

      if (action.inputSchema !== undefined) {
        const validation = action.inputSchema.validate(request.input);
        if (validation._tag === "failure") {
          return {
            _tag: "validation",
            field: validation.field,
            message: validation.message,
          };
        }

        return yield* executeActionRunEffect<Output, E>(action, validation.value, request.signal);
      }

      return yield* executeActionRunEffect<Output, E>(action, request.input, request.signal);
    });

  const dispatch = <Output, E>(
    request: ServerActionDispatchRequest,
  ): Promise<ServerActionWireResult<Output, E>> => Effect.runPromise(dispatchEffect(request));

  return {
    dispatchEffect,
    dispatch,
  };
};

export const createInMemoryServerActionTransport = (
  dispatcher: ServerActionDispatcher,
): ServerActionTransport => ({
  call: async (name, input, options) => {
    const request: ServerActionDispatchRequest = {
      name,
      input,
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    };
    return dispatcher.dispatch(request);
  },
});
