import type { AnyRoute, AnyRouteLoader } from "../router";
import type { AnyServerAction } from "../server";

export interface ComposeFrameworkRuntimeOptions<
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
> {
  readonly routes: TRoutes;
  readonly actions: TActions;
  readonly manifestLoaders?: readonly AnyRouteLoader[];
  readonly loaders?: readonly AnyRouteLoader[];
}

export interface ComposedFrameworkRuntime<
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
> {
  readonly routes: TRoutes;
  readonly actions: TActions;
  readonly loaders: readonly AnyRouteLoader[];
}

export const mergeRouteLoaders = (
  manifestLoaders: readonly AnyRouteLoader[],
  explicitLoaders: readonly AnyRouteLoader[],
): readonly AnyRouteLoader[] => {
  const deduped = new Map<string, AnyRouteLoader>();
  for (const loader of manifestLoaders) {
    deduped.set(loader.route.id, loader);
  }
  for (const loader of explicitLoaders) {
    deduped.set(loader.route.id, loader);
  }
  return Array.from(deduped.values());
};

export const composeFrameworkRuntime = <
  TRoutes extends readonly AnyRoute[],
  TActions extends readonly AnyServerAction[],
>(
  options: ComposeFrameworkRuntimeOptions<TRoutes, TActions>,
): ComposedFrameworkRuntime<TRoutes, TActions> => ({
  routes: options.routes,
  actions: options.actions,
  loaders: mergeRouteLoaders(options.manifestLoaders ?? [], options.loaders ?? []),
});
