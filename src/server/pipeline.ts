import type { EffectRuntime } from "../internal/runtimeContext";
import type { AnyRoute } from "../router";
import { Effect } from "effect";
import type { AnyServerAction } from "./actions";
import { createServerActionHttpHandlerEffect, type ServerActionHttpHandlerOptions } from "./http";
import {
  createRouteRequestHandlerEffect,
  type CreateRouteRequestHandlerOptions,
  type RouteHandler,
} from "./route";
import { normalizeActionBasePath } from "./decode";

export interface CreateRequestPipelineOptions<TRoutes extends readonly AnyRoute[]> {
  readonly runtime: EffectRuntime;
  readonly routes: TRoutes;
  readonly actions: readonly AnyServerAction[];
  readonly handlers?: readonly RouteHandler<TRoutes[number], unknown, unknown, unknown>[];
  readonly actionBasePath?: string;
  readonly routeOptions?: CreateRouteRequestHandlerOptions;
}

export interface RequestPipeline {
  readonly actionBasePath: string;
  readonly handleEffect: (request: Request) => Effect.Effect<Response, never, never>;
  readonly handle: (request: Request) => Promise<Response>;
}

const isActionRequest = (pathname: string, actionBasePath: string): boolean =>
  pathname === actionBasePath || pathname.startsWith(`${actionBasePath}/`);

export const createRequestPipeline = <TRoutes extends readonly AnyRoute[]>(
  options: CreateRequestPipelineOptions<TRoutes>,
): RequestPipeline => {
  const actionBasePath = normalizeActionBasePath(options.actionBasePath ?? "/__effect/actions");

  const actionHandler = createServerActionHttpHandlerEffect({
    runtime: options.runtime,
    actions: options.actions,
    basePath: actionBasePath,
  } satisfies ServerActionHttpHandlerOptions);

  const routeHandler = createRouteRequestHandlerEffect(
    options.runtime,
    (options.handlers ?? []) as readonly RouteHandler<AnyRoute, unknown, unknown, unknown>[],
    options.routeOptions,
  );

  const handleEffect = (request: Request): Effect.Effect<Response, never, never> =>
    Effect.gen(function* () {
      const url = new URL(request.url);
      if (isActionRequest(url.pathname, actionBasePath)) {
        return yield* actionHandler(request);
      }
      return yield* routeHandler(request);
    });

  return {
    actionBasePath,
    handleEffect,
    handle: (request) => Effect.runPromise(handleEffect(request)),
  };
};
