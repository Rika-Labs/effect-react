import type {
  AnyServerAction,
  ServerActionDispatcher,
  ServerActionTransport,
  ServerActionWireResult,
} from "./actions";
import {
  ServerActionTransportError,
  createServerActionDispatcher,
  runServerActionEffectValue,
} from "./actions";
import type { EffectRuntime } from "../internal/runtimeContext";
import { RequestContextLive } from "./context";
import {
  decodeActionRequestPayload,
  decodeJsonBodyEffect,
  decodeServerActionWireResult,
  normalizeActionBasePath,
  parseActionNameFromPath,
} from "./decode";
import { Cause, Effect, Exit } from "effect";

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ServerActionHttpHandlerOptions {
  readonly runtime: EffectRuntime;
  readonly actions: readonly AnyServerAction[];
  readonly basePath?: string;
}

export interface ServerActionFetchTransportOptions {
  readonly endpoint: string;
  readonly fetcher?: FetchLike;
}

export type ServerActionHttpHandlerEffect = (
  request: Request,
) => Effect.Effect<Response, never, never>;

const createJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

export const createServerActionHttpHandlerEffect = (
  options: ServerActionHttpHandlerOptions,
): ServerActionHttpHandlerEffect => {
  const basePath = normalizeActionBasePath(options.basePath ?? "/__effect/actions");
  const dispatcher = createServerActionDispatcher(options.runtime, options.actions);

  return (request: Request): Effect.Effect<Response, never, never> =>
    Effect.gen(function* () {
      if (request.method.toUpperCase() !== "POST") {
        return createJsonResponse(405, { error: "Method Not Allowed" });
      }

      const url = new URL(request.url);
      const actionName = parseActionNameFromPath(url, basePath);
      if (actionName === undefined) {
        return createJsonResponse(404, { error: "Not Found" });
      }

      const jsonBody = yield* decodeJsonBodyEffect(request);
      if (jsonBody._tag === "failure") {
        return createJsonResponse(400, { error: jsonBody.message });
      }

      const payload = decodeActionRequestPayload(jsonBody.value);
      if (payload._tag === "failure") {
        return createJsonResponse(400, { error: payload.message });
      }

      const requestPayload = {
        name: actionName,
        input: payload.value.input,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };
      const result = yield* dispatcher.dispatchEffect(requestPayload);

      return createJsonResponse(200, result);
    }).pipe(
      Effect.catchAllCause((cause) =>
        Effect.succeed(
          createJsonResponse(500, {
            error: "Internal Server Error",
            defect: Cause.pretty(cause),
          }),
        ),
      ),
    );
};

export const createServerActionHttpHandler = (
  options: ServerActionHttpHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  const handleRequest = createServerActionHttpHandlerEffect(options);

  return (request) => Effect.runPromise(handleRequest(request));
};

export const createRequestScopedServerActionHttpHandlerEffect = (
  options: ServerActionHttpHandlerOptions,
): ServerActionHttpHandlerEffect => {
  const basePath = normalizeActionBasePath(options.basePath ?? "/__effect/actions");
  const actionMap = new Map(options.actions.map((action) => [action.name, action] as const));

  return (request: Request): Effect.Effect<Response, never, never> =>
    Effect.gen(function* () {
      if (request.method.toUpperCase() !== "POST") {
        return createJsonResponse(405, { error: "Method Not Allowed" });
      }

      const url = new URL(request.url);
      const actionName = parseActionNameFromPath(url, basePath);
      if (actionName === undefined) {
        return createJsonResponse(404, { error: "Not Found" });
      }

      const action = actionMap.get(actionName);
      if (action === undefined) {
        return createJsonResponse(200, {
          _tag: "defect" as const,
          message: `Unknown server action: ${actionName}`,
        });
      }

      const jsonBody = yield* decodeJsonBodyEffect(request);
      if (jsonBody._tag === "failure") {
        return createJsonResponse(400, { error: jsonBody.message });
      }

      const payload = decodeActionRequestPayload(jsonBody.value);
      if (payload._tag === "failure") {
        return createJsonResponse(400, { error: payload.message });
      }

      if (action.inputSchema !== undefined) {
        const validation = action.inputSchema.validate(payload.value.input);
        if (validation._tag === "failure") {
          return createJsonResponse(200, {
            _tag: "validation" as const,
            field: validation.field,
            message: validation.message,
          });
        }
      }

      const requestLayer = RequestContextLive(request);
      const effect = Effect.provide(action.run(payload.value.input), requestLayer);
      const result = yield* runServerActionEffectValue(
        options.runtime,
        effect as Effect.Effect<unknown, unknown, never>,
        action.errorCodec,
        request.signal,
      );

      return createJsonResponse(200, result);
    }).pipe(
      Effect.catchAllCause((cause) =>
        Effect.succeed(
          createJsonResponse(500, {
            error: "Internal Server Error",
            defect: Cause.pretty(cause),
          }),
        ),
      ),
    );
};

export const createRequestScopedServerActionHttpHandler = (
  options: ServerActionHttpHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  const handleRequest = createRequestScopedServerActionHttpHandlerEffect(options);

  return (request) => Effect.runPromise(handleRequest(request));
};

export const createFetchServerActionTransport = (
  options: ServerActionFetchTransportOptions,
): ServerActionTransport => {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = options.endpoint.endsWith("/")
    ? options.endpoint.slice(0, -1)
    : options.endpoint;
  const runTransportEffect = async <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> => {
    const exit = await Effect.runPromiseExit(effect);
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  };

  return {
    call: <Output, E>(
      name: string,
      input: unknown,
      callOptions?: { readonly signal?: AbortSignal },
    ): Promise<ServerActionWireResult<Output, E>> =>
      runTransportEffect(
        Effect.gen(function* () {
          const init: RequestInit = {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ input }),
            ...(callOptions?.signal !== undefined ? { signal: callOptions.signal } : {}),
          };
          const response = yield* Effect.tryPromise({
            try: () => fetcher(`${endpoint}/${encodeURIComponent(name)}`, init),
            catch: (cause) =>
              new ServerActionTransportError(`Server action transport failed for "${name}"`, cause),
          });

          if (!response.ok) {
            return yield* Effect.fail(
              new ServerActionTransportError(
                `Server action request failed with status ${String(response.status)}`,
                response.status,
              ),
            );
          }

          const responsePayload: unknown = yield* Effect.tryPromise({
            try: () => response.json() as Promise<unknown>,
            catch: (cause) =>
              new ServerActionTransportError(`Server action transport failed for "${name}"`, cause),
          });

          const wireResult = decodeServerActionWireResult<Output, E>(responsePayload);
          if (wireResult._tag === "failure") {
            return yield* Effect.fail(
              new ServerActionTransportError(wireResult.message, responsePayload),
            );
          }

          return wireResult.value;
        }),
      ),
  };
};

export const createServerActionHttpDispatcher = (
  runtime: EffectRuntime,
  actions: readonly AnyServerAction[],
): ServerActionDispatcher => createServerActionDispatcher(runtime, actions);
