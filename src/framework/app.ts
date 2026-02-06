import type { AnyManagedRuntime } from "../internal/runtimeContext";
import { Effect } from "effect";
import { createRouter, type AnyRouteLoader, type Router, type RouterHistory } from "../router";
import type { AnyRoute } from "../router";
import type { ReactElement } from "react";
import { QueryCache } from "../query/QueryCache";
import {
  createFetchServerActionTransport,
  createRequestPipeline,
  type AnyServerAction,
  type RouteHandler,
  type RouteMiddleware,
  type ServerActionTransport,
} from "../server";
import { loadServerActionsFromManifest, type ServerActionManifestModule } from "./actionRegistry";
import { composeFrameworkRuntime } from "./compose";
import {
  loadRouteLoadersFromManifest,
  loadRoutesFromManifest,
  type RouteManifestModule,
  type RouteRegistryError,
} from "./routeRegistry";
import {
  createFrameworkSsrRequestHandler,
  type FrameworkSsrOrchestratorError,
  type FrameworkSsrRenderContext,
  type FrameworkSsrRenderMode,
} from "./ssrOrchestrator";

export interface DefineAppOptions<
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
> {
  readonly runtime: AnyManagedRuntime;
  readonly routes: TRoutes;
  readonly actions: TActions;
  readonly handlers?: readonly RouteHandler<TRoutes[number], unknown, unknown, unknown>[];
  readonly loaders?: readonly AnyRouteLoader[];
  readonly middlewares?: readonly RouteMiddleware[];
  readonly history?: RouterHistory;
  readonly actionBasePath?: string;
}

export interface EffectApp<
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
> {
  readonly runtime: AnyManagedRuntime;
  readonly routes: TRoutes;
  readonly actions: TActions;
  readonly loaders: readonly AnyRouteLoader[];
  readonly router: Router<TRoutes>;
  readonly createServerHandler: () => (request: Request) => Promise<Response>;
  readonly createActionTransport: (options?: {
    readonly endpoint?: string;
  }) => ServerActionTransport;
  readonly createSsrHandler: <E>(
    options: CreateAppSsrHandlerOptions<E>,
  ) => (request: Request) => Promise<Response>;
}

export interface CreateAppSsrHandlerOptions<E> {
  readonly render: (context: FrameworkSsrRenderContext) => Effect.Effect<ReactElement, E, never>;
  readonly mode?: FrameworkSsrRenderMode;
  readonly globalName?: string;
  readonly status?: number;
  readonly headers?: HeadersInit;
  readonly createCache?: () => QueryCache;
  readonly onError?: (error: FrameworkSsrOrchestratorError<E>) => Response;
}

export const defineApp = <
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
>(
  options: DefineAppOptions<TRoutes, TActions>,
): EffectApp<TRoutes, TActions> => {
  const composed = composeFrameworkRuntime({
    routes: options.routes,
    actions: options.actions,
    ...(options.loaders !== undefined ? { loaders: options.loaders } : {}),
  });

  const router = createRouter({
    runtime: options.runtime,
    routes: composed.routes,
    ...(composed.loaders.length > 0 ? { loaders: composed.loaders } : {}),
    ...(options.history !== undefined ? { history: options.history } : {}),
  });

  const pipeline = createRequestPipeline({
    runtime: options.runtime,
    routes: composed.routes,
    actions: composed.actions,
    ...(options.handlers !== undefined ? { handlers: options.handlers } : {}),
    ...(options.actionBasePath !== undefined ? { actionBasePath: options.actionBasePath } : {}),
    ...(options.middlewares !== undefined
      ? { routeOptions: { middlewares: options.middlewares } }
      : {}),
  });

  return {
    runtime: options.runtime,
    routes: composed.routes,
    actions: composed.actions,
    loaders: composed.loaders,
    router,
    createServerHandler: () => pipeline.handle,
    createActionTransport: (transportOptions) =>
      createFetchServerActionTransport({
        endpoint: transportOptions?.endpoint ?? pipeline.actionBasePath,
      }),
    createSsrHandler: (ssrOptions) =>
      createFrameworkSsrRequestHandler({
        runtime: options.runtime,
        routes: composed.routes,
        loaders: composed.loaders,
        ...(ssrOptions.mode !== undefined ? { mode: ssrOptions.mode } : {}),
        ...(ssrOptions.globalName !== undefined ? { globalName: ssrOptions.globalName } : {}),
        ...(ssrOptions.status !== undefined ? { status: ssrOptions.status } : {}),
        ...(ssrOptions.headers !== undefined ? { headers: ssrOptions.headers } : {}),
        ...(ssrOptions.onError !== undefined ? { onError: ssrOptions.onError } : {}),
        cache: ssrOptions.createCache ?? (() => new QueryCache()),
        render: ssrOptions.render,
      }),
  };
};

export interface DefineAppFromManifestOptions<TRoutes extends readonly AnyRoute[]> extends Omit<
  DefineAppOptions<TRoutes, readonly AnyServerAction[]>,
  "actions"
> {
  readonly manifestModule: ServerActionManifestModule;
}

export const defineAppFromManifest = <TRoutes extends readonly AnyRoute[]>(
  options: DefineAppFromManifestOptions<TRoutes>,
): Effect.Effect<EffectApp<TRoutes, readonly AnyServerAction[]>, Error, never> =>
  Effect.map(loadServerActionsFromManifest(options.manifestModule), (actions) =>
    defineApp({
      ...options,
      actions,
    }),
  );

export interface DefineAppFromManifestsOptions {
  readonly runtime: AnyManagedRuntime;
  readonly actionManifestModule: ServerActionManifestModule;
  readonly routeManifestModule: RouteManifestModule;
  readonly handlers?: readonly RouteHandler<AnyRoute, unknown, unknown, unknown>[];
  readonly loaders?: readonly AnyRouteLoader[];
  readonly middlewares?: readonly RouteMiddleware[];
  readonly history?: RouterHistory;
  readonly actionBasePath?: string;
}

export type ManifestAppError = Error | RouteRegistryError;

export const defineAppFromManifests = (
  options: DefineAppFromManifestsOptions,
): Effect.Effect<
  EffectApp<readonly AnyRoute[], readonly AnyServerAction[]>,
  ManifestAppError,
  never
> =>
  Effect.gen(function* () {
    const [actions, routes, manifestLoaders] = yield* Effect.all([
      loadServerActionsFromManifest(options.actionManifestModule),
      loadRoutesFromManifest(options.routeManifestModule),
      loadRouteLoadersFromManifest(options.routeManifestModule),
    ]);

    const composed = composeFrameworkRuntime({
      routes,
      actions,
      manifestLoaders,
      ...(options.loaders !== undefined ? { loaders: options.loaders } : {}),
    });

    return defineApp({
      runtime: options.runtime,
      routes: composed.routes,
      actions: composed.actions,
      loaders: composed.loaders,
      ...(options.handlers !== undefined ? { handlers: options.handlers } : {}),
      ...(options.middlewares !== undefined ? { middlewares: options.middlewares } : {}),
      ...(options.history !== undefined ? { history: options.history } : {}),
      ...(options.actionBasePath !== undefined ? { actionBasePath: options.actionBasePath } : {}),
    });
  });
