import { Cause, Effect, Exit, Option } from "effect";
import type { EffectRuntime } from "../internal/runtimeContext";
import type { ReactElement } from "react";
import * as ReactDOMServer from "react-dom/server";
import type { QueryCache } from "../query/QueryCache";
import type { RouteLoaderSnapshot } from "../router/loader";
import { createFrameworkHydrationScript, dehydrateFrameworkState } from "../ssr/dehydrate";

export class ServerRenderFailureError<E> extends Error {
  constructor(readonly error: E) {
    super("Server render failed");
    this.name = "ServerRenderFailureError";
  }
}

export class ServerRenderDefectError extends Error {
  constructor(readonly causePretty: string) {
    super(causePretty);
    this.name = "ServerRenderDefectError";
  }
}

const extractFailure = <A, E>(
  exit: Exit.Exit<A, E>,
):
  | {
      readonly _tag: "success";
      readonly value: A;
    }
  | {
      readonly _tag: "failure";
      readonly error: E;
    }
  | {
      readonly _tag: "defect";
      readonly message: string;
    } => {
  if (Exit.isSuccess(exit)) {
    return {
      _tag: "success",
      value: exit.value,
    };
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    return {
      _tag: "failure",
      error: failure.value,
    };
  }

  return {
    _tag: "defect",
    message: Cause.pretty(exit.cause),
  };
};

export interface RenderEffectOptions {
  readonly signal?: AbortSignal;
}

export interface CreateServerHydrationScriptOptions {
  readonly cache: QueryCache;
  readonly loaderState?: RouteLoaderSnapshot;
  readonly globalName?: string;
}

export const createServerHydrationScript = (
  options: CreateServerHydrationScriptOptions,
): string => {
  const dehydrateOptions =
    options.loaderState === undefined
      ? { cache: options.cache }
      : { cache: options.cache, loaderState: options.loaderState };

  return createFrameworkHydrationScript(
    dehydrateFrameworkState(dehydrateOptions),
    options.globalName,
  );
};

const renderDefectFromUnknown = (cause: unknown): ServerRenderDefectError =>
  new ServerRenderDefectError(Cause.pretty(Cause.die(cause)));

const runEffectWithSquashedCause = async <A>(
  effect: Effect.Effect<A, unknown, never>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
};

const runRenderProgram = <E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<ReactElement, E, never>,
  options?: RenderEffectOptions,
): Effect.Effect<ReactElement, ServerRenderFailureError<E> | ServerRenderDefectError, never> => {
  const runOptions = options?.signal === undefined ? undefined : { signal: options.signal };

  return Effect.flatMap(
    Effect.tryPromise({
      try: () => runtime.runPromiseExit(Effect.scoped(effect), runOptions),
      catch: (cause) => renderDefectFromUnknown(cause),
    }),
    (
      exit,
    ): Effect.Effect<
      ReactElement,
      ServerRenderFailureError<E> | ServerRenderDefectError,
      never
    > => {
      const result = extractFailure(exit);
      if (result._tag === "success") {
        return Effect.succeed(result.value);
      }
      if (result._tag === "failure") {
        return Effect.fail(new ServerRenderFailureError(result.error));
      }
      return Effect.fail(new ServerRenderDefectError(result.message));
    },
  );
};

export const renderEffectToStringEffect = <E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<ReactElement, E, never>,
  options?: RenderEffectOptions,
): Effect.Effect<string, ServerRenderFailureError<E> | ServerRenderDefectError, never> =>
  Effect.map(runRenderProgram(runtime, effect, options), (element) =>
    ReactDOMServer.renderToString(element),
  );

export const renderEffectToString = <E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<ReactElement, E, never>,
  options?: RenderEffectOptions,
): Promise<string> =>
  runEffectWithSquashedCause(renderEffectToStringEffect(runtime, effect, options));

export const renderEffectToReadableStreamEffect = <E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<ReactElement, E, never>,
  options?: RenderEffectOptions,
): Effect.Effect<ReadableStream, ServerRenderFailureError<E> | ServerRenderDefectError, never> =>
  Effect.flatMap(runRenderProgram(runtime, effect, options), (element) => {
    const renderToReadableStream = (
      ReactDOMServer as unknown as {
        readonly renderToReadableStream?: (value: ReactElement) => Promise<ReadableStream>;
      }
    ).renderToReadableStream;

    if (renderToReadableStream === undefined) {
      const html = ReactDOMServer.renderToString(element);
      return Effect.succeed(
        new ReadableStream({
          start: (controller) => {
            controller.enqueue(new TextEncoder().encode(html));
            controller.close();
          },
        }),
      );
    }

    return Effect.tryPromise({
      try: () => renderToReadableStream(element),
      catch: (cause) => renderDefectFromUnknown(cause),
    });
  });

export const renderEffectToReadableStream = <E>(
  runtime: EffectRuntime,
  effect: Effect.Effect<ReactElement, E, never>,
  options?: RenderEffectOptions,
): Promise<ReadableStream> =>
  runEffectWithSquashedCause(renderEffectToReadableStreamEffect(runtime, effect, options));
