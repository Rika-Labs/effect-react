import { Cause, Effect, Exit, Layer, Option } from "effect";
import type { EffectRuntime } from "../internal/runtimeContext";
import type { AnyRoute, RouteParamsOf, RouteSearchOf } from "../router/types";
import { RequestContextLive } from "./context";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteHandlerContext<TRoute extends AnyRoute> {
  readonly request: Request;
  readonly params: RouteParamsOf<TRoute>;
  readonly search: RouteSearchOf<TRoute>;
}

export interface RouteHandler<TRoute extends AnyRoute, Output, E, R = never> {
  readonly method: HttpMethod;
  readonly route: TRoute;
  run(context: RouteHandlerContext<TRoute>): Effect.Effect<Output, E, R>;
  toResponse?(output: Output): Response;
  onFailure?(error: E): Response;
}

export interface RouteMiddlewareContext {
  readonly request: Request;
  readonly route: AnyRoute;
  readonly params: Readonly<Record<string, string>>;
  readonly search: unknown;
}

export type RouteMiddleware = <A, E>(
  context: RouteMiddlewareContext,
  next: () => Effect.Effect<A, E, unknown>,
) => Effect.Effect<A, E, unknown>;

export interface ContextMiddleware {
  readonly provide: (request: Request) => Layer.Layer<never>;
}

export const defineRouteHandler = <TRoute extends AnyRoute, Output, E, R = never>(
  handler: RouteHandler<TRoute, Output, E, R>,
): RouteHandler<TRoute, Output, E, R> => handler;

const defaultSuccessResponse = (output: unknown): Response =>
  new Response(JSON.stringify(output), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

const defaultFailureResponse = (error: unknown): Response =>
  new Response(JSON.stringify({ error }), {
    status: 500,
    headers: {
      "content-type": "application/json",
    },
  });

const composeRouteMiddleware = <A, E>(
  middlewares: readonly RouteMiddleware[],
  context: RouteMiddlewareContext,
  runHandler: () => Effect.Effect<A, E, unknown>,
): Effect.Effect<A, E, unknown> =>
  middlewares.reduceRight<Effect.Effect<A, E, unknown>>(
    (next, middleware) => middleware(context, () => next),
    runHandler(),
  );

export interface CreateRouteRequestHandlerOptions {
  readonly middlewares?: readonly RouteMiddleware[];
  readonly contextMiddlewares?: readonly ContextMiddleware[];
}

export type RouteRequestHandlerEffect = (request: Request) => Effect.Effect<Response, never, never>;

export const createRouteRequestHandlerEffect = (
  runtime: EffectRuntime,
  handlers: readonly RouteHandler<AnyRoute, unknown, unknown, unknown>[],
  options: CreateRouteRequestHandlerOptions = {},
): RouteRequestHandlerEffect => {
  const middlewares = options.middlewares ?? [];
  const contextMiddlewares = options.contextMiddlewares ?? [];

  return (request) =>
    Effect.gen(function* () {
      const method = request.method.toUpperCase() as HttpMethod;
      const url = new URL(request.url);

      for (const handler of handlers) {
        if (handler.method !== method) {
          continue;
        }

        const pathMatch = handler.route.matchPath(url.pathname);
        if (pathMatch === null) {
          continue;
        }

        const parsedSearchExit = yield* Effect.exit(
          Effect.sync(() => handler.route.searchAdapter?.parse(url.searchParams) ?? {}),
        );
        if (Exit.isFailure(parsedSearchExit)) {
          return defaultFailureResponse({
            defect: Cause.pretty(parsedSearchExit.cause),
          });
        }

        const parsedSearch = parsedSearchExit.value;
        const middlewareContext: RouteMiddlewareContext = {
          request,
          route: handler.route,
          params: pathMatch.params as Readonly<Record<string, string>>,
          search: parsedSearch,
        };

        const effect = composeRouteMiddleware(middlewares, middlewareContext, () =>
          handler.run({
            request,
            params: pathMatch.params,
            search: parsedSearch,
          }),
        );

        const requestLayer = RequestContextLive(request);
        const additionalLayers = contextMiddlewares.map((m) => m.provide(request));
        const combinedLayer = additionalLayers.reduce<Layer.Layer<never>>(
          (acc, layer) => Layer.merge(acc, layer) as Layer.Layer<never>,
          requestLayer as Layer.Layer<never>,
        );

        const provided = Effect.provide(effect, combinedLayer);
        const scoped = Effect.scoped(provided as Effect.Effect<unknown, unknown, never>);

        const runOptions = request.signal === undefined ? undefined : { signal: request.signal };
        const exit = yield* Effect.promise(() => runtime.runPromiseExit(scoped, runOptions));

        if (Exit.isSuccess(exit)) {
          return handler.toResponse?.(exit.value) ?? defaultSuccessResponse(exit.value);
        }

        const failure = Cause.failureOption(exit.cause);
        if (Option.isSome(failure)) {
          return handler.onFailure?.(failure.value) ?? defaultFailureResponse(failure.value);
        }

        return defaultFailureResponse({
          defect: Cause.pretty(exit.cause),
        });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      });
    }).pipe(
      Effect.catchAllCause((cause) =>
        Effect.succeed(
          defaultFailureResponse({
            defect: Cause.pretty(cause),
          }),
        ),
      ),
    );
};

export const createRouteRequestHandler = (
  runtime: EffectRuntime,
  handlers: readonly RouteHandler<AnyRoute, unknown, unknown, unknown>[],
  options: CreateRouteRequestHandlerOptions = {},
): ((request: Request) => Promise<Response>) => {
  const handlerEffect = createRouteRequestHandlerEffect(runtime, handlers, options);
  return (request) => Effect.runPromise(handlerEffect(request));
};
