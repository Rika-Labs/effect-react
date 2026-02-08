import { Effect, Schema } from "effect";
import { Boundary } from "../boundary";
import { Actions } from "./service";
import { type ActionDefinition, type ActionError, type ActionWireResult } from "./types";

const ActionRequestSchema = Schema.Struct({
  name: Schema.String,
  input: Schema.Unknown,
});

const ActionWireResultSchema = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal("success"), value: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal("failure"), error: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.Literal("defect"), message: Schema.String }),
);

export class ActionTransportError extends Error {
  readonly _tag = "ActionTransportError" as const;

  constructor(
    readonly messageText: string,
    readonly causeValue?: unknown,
  ) {
    super(messageText);
    this.name = "ActionTransportError";
  }
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

export const createActionHttpHandlerEffect = (): ((
  request: Request,
) => Effect.Effect<Response, never, Boundary | Actions>) =>
  (request) =>
    Effect.gen(function* () {
      if (request.method.toUpperCase() !== "POST") {
        return jsonResponse(405, { error: "Method Not Allowed" });
      }

      const rawBody = yield* Effect.tryPromise({
        try: () => request.text(),
        catch: (cause) => new ActionTransportError("Failed to read request body", cause),
      });

      const boundary = yield* Boundary;
      const payload = yield* boundary.decodeTextJson({
        source: "action:http:request",
        schema: ActionRequestSchema,
        text: rawBody,
      });

      const actions = yield* Actions;
      const result = yield* actions.dispatch(payload.name, payload.input);

      return jsonResponse(200, result);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed(
          jsonResponse(500, {
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    );

export const createActionHttpHandler = () => {
  const handleEffect = createActionHttpHandlerEffect();
  return (runtimeRun: <A>(effect: Effect.Effect<A, unknown, Boundary | Actions>) => Promise<A>) =>
    (request: Request): Promise<Response> => runtimeRun(handleEffect(request));
};

export const callActionWire = <Name extends string, Input, Output, E>(
  definition: ActionDefinition<Name, Input, Output, E>,
  options: {
    readonly endpoint: string;
    readonly input: Input;
    readonly fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    readonly signal?: AbortSignal;
  },
): Effect.Effect<Output, ActionError<E> | ActionTransportError, Boundary> =>
  Effect.gen(function* () {
    const boundary = yield* Boundary;
    const fetcher = options.fetcher ?? fetch;

    const encodedInput = yield* boundary.encode({
      source: `action:${definition.name}:client-input`,
      schema: definition.input,
      value: options.input,
    });

    const body = JSON.stringify({
      name: definition.name,
      input: encodedInput,
    });

    const response = yield* Effect.tryPromise({
      try: () =>
        fetcher(options.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        }),
      catch: (cause) => new ActionTransportError(`Failed to call ${definition.name}`, cause),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new ActionTransportError(
          `Action endpoint returned status ${String(response.status)} for ${definition.name}`,
          response.status,
        ),
      );
    }

    const rawText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new ActionTransportError(`Failed to read response for ${definition.name}`, cause),
    });

    const wire = yield* boundary.decodeTextJson({
      source: `action:${definition.name}:wire`,
      schema: ActionWireResultSchema,
      text: rawText,
    });

    const typedWire = wire as ActionWireResult;

    if (typedWire._tag === "success") {
      return yield* boundary.decodeUnknown({
        source: `action:${definition.name}:client-output`,
        schema: definition.output,
        value: typedWire.value,
      });
    }

    if (typedWire._tag === "failure") {
      const decodedError = yield* boundary.decodeUnknown({
        source: `action:${definition.name}:client-error`,
        schema: definition.error,
        value: typedWire.error,
      });
      return yield* Effect.fail(decodedError as E);
    }

    return yield* Effect.fail(new ActionTransportError(typedWire.message));
  });
