import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { RouteLoaderSnapshotEntry } from "./loader";
import type {
  AnyRoute,
  LazyRouteModule,
  MatchChainEntry,
  NavigateRouteOptions,
  RouteLocation,
} from "./types";
import type { Router, RouterSnapshot } from "./router";

const RouterContext = createContext<Router<readonly AnyRoute[]> | null>(null);
const OutletContext = createContext<ReactNode>(null);
const MatchChainContext = createContext<readonly MatchChainEntry[]>([]);
const MatchChainIndexContext = createContext<number>(0);

export interface RouterProviderProps<TRoutes extends readonly AnyRoute[]> {
  readonly router: Router<TRoutes>;
  readonly children: ReactNode;
  readonly outlet?: ReactNode;
  readonly routeComponents?: Readonly<Record<string, React.ComponentType>>;
}

const NestedOutletRenderer = ({
  chain,
  index,
  routeComponents,
}: {
  readonly chain: readonly MatchChainEntry[];
  readonly index: number;
  readonly routeComponents: Readonly<Record<string, React.ComponentType>>;
}): ReactNode => {
  if (index >= chain.length) return null;

  const entry = chain[index]!;
  const Component = routeComponents[entry.route.id];
  if (Component === undefined) return null;

  const nextOutlet =
    index + 1 < chain.length ? (
      <NestedOutletRenderer chain={chain} index={index + 1} routeComponents={routeComponents} />
    ) : null;

  return (
    <MatchChainContext.Provider value={chain}>
      <MatchChainIndexContext.Provider value={index}>
        <OutletContext.Provider value={nextOutlet}>
          {createElement(Component)}
        </OutletContext.Provider>
      </MatchChainIndexContext.Provider>
    </MatchChainContext.Provider>
  );
};

export const RouterProvider = <TRoutes extends readonly AnyRoute[]>({
  router,
  children,
  outlet,
  routeComponents,
}: RouterProviderProps<TRoutes>) => {
  const snapshot = useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
  const chain = snapshot.matchChain;

  const resolvedOutlet =
    routeComponents !== undefined && chain.length > 0 ? (
      <NestedOutletRenderer chain={chain} index={0} routeComponents={routeComponents} />
    ) : (
      (outlet ?? null)
    );

  return (
    <RouterContext.Provider value={router as unknown as Router<readonly AnyRoute[]>}>
      <MatchChainContext.Provider value={chain}>
        <OutletContext.Provider value={resolvedOutlet}>{children}</OutletContext.Provider>
      </MatchChainContext.Provider>
    </RouterContext.Provider>
  );
};

export const useRouter = <
  TRoutes extends readonly AnyRoute[] = readonly AnyRoute[],
>(): Router<TRoutes> => {
  const router = useContext(RouterContext);
  if (router === null) {
    throw new Error("Missing RouterProvider context");
  }
  return router as unknown as Router<TRoutes>;
};

export const useRouterSnapshot = <
  TRoutes extends readonly AnyRoute[] = readonly AnyRoute[],
>(): RouterSnapshot<TRoutes> => {
  const router = useRouter<TRoutes>();
  return useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
};

export const useCurrentRoute = <
  TRoutes extends readonly AnyRoute[] = readonly AnyRoute[],
>(): RouteLocation<TRoutes[number]> | null => {
  const snapshot = useRouterSnapshot<TRoutes>();
  return snapshot.match;
};

export const useRoute = useCurrentRoute;

export const useRouteMatch = <TRoute extends AnyRoute>(
  route: TRoute,
): RouteLocation<TRoute> | null => {
  const router = useRouter();
  const snapshot = useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
  if (snapshot.match === null || snapshot.match.route.id !== route.id) {
    return null;
  }
  return snapshot.match as RouteLocation<TRoute>;
};

export const useParams = <TRoute extends AnyRoute>(
  route: TRoute,
): RouteLocation<TRoute>["params"] | null => {
  const match = useRouteMatch(route);
  return match?.params ?? null;
};

export const useRouteSearch = <TRoute extends AnyRoute>(
  route: TRoute,
): RouteLocation<TRoute>["search"] | null => {
  const match = useRouteMatch(route);
  return match?.search ?? null;
};

export const useSearchParams = useRouteSearch;

export interface NavigateFn {
  <TRoute extends AnyRoute>(route: TRoute, options?: NavigateRouteOptions<TRoute>): void;
  (path: string, options?: { readonly replace?: boolean }): void;
}

export const useNavigate = (): NavigateFn => {
  const router = useRouter();

  return useMemo(() => {
    const navigateImpl = ((target: AnyRoute | string, options?: unknown) => {
      if (typeof target === "string") {
        router.navigatePath(target, options as { readonly replace?: boolean } | undefined);
        return;
      }
      router.navigate(target as never, options as never);
    }) as NavigateFn;

    return navigateImpl;
  }, [router]);
};

type LinkOptions<TRoute extends AnyRoute> = NavigateRouteOptions<TRoute>;

export type LinkProps<TRoute extends AnyRoute> = Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "onClick"
> &
  LinkOptions<TRoute> & {
    readonly route: TRoute;
    readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  };

const shouldHandleClick = (event: MouseEvent<HTMLAnchorElement>): boolean => {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  return true;
};

export const Link = <TRoute extends AnyRoute>({
  route,
  params,
  search,
  replace,
  onClick,
  ...props
}: LinkProps<TRoute>) => {
  const navigate = useNavigate();
  const href = route.buildHref({
    params,
    search,
  } as NavigateRouteOptions<TRoute>);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (!shouldHandleClick(event)) {
        return;
      }
      event.preventDefault();
      navigate(route, {
        params,
        search,
        replace,
      } as NavigateRouteOptions<TRoute>);
    },
    [navigate, onClick, params, replace, route, search],
  );

  return <a {...props} href={href} onClick={handleClick} />;
};

export interface OutletProps {
  readonly fallback?: ReactNode;
}

export const Outlet = ({ fallback = null }: OutletProps) => {
  const outlet = useContext(OutletContext);
  return <>{outlet ?? fallback}</>;
};

export const useMatchChain = (): readonly MatchChainEntry[] => useContext(MatchChainContext);

export const useRouteLoadersPending = (): boolean => {
  const snapshot = useRouterSnapshot();
  return snapshot.loadersPending;
};

export const useRouteLoaderState = <TRoute extends AnyRoute>(
  route: TRoute,
): RouteLoaderSnapshotEntry | undefined => {
  const snapshot = useRouterSnapshot();
  return snapshot.loaderState[route.id];
};

export const useRevalidateRouteLoaders = (): (() => Promise<void>) => {
  const router = useRouter();
  return useMemo(() => () => router.revalidate(), [router]);
};

export interface PrefetchHandlers {
  readonly onMouseEnter: () => void;
  readonly onFocus: () => void;
}

const prefetchCache = new Map<string, Promise<unknown>>();

export const usePrefetchRoute = <TRoute extends AnyRoute>(
  lazyRoute: LazyRouteModule<TRoute>,
): PrefetchHandlers => {
  const loadRef = useRef(lazyRoute.load);
  loadRef.current = lazyRoute.load;

  const triggerPrefetch = useCallback(() => {
    const key = lazyRoute.route.id;
    if (!prefetchCache.has(key)) {
      prefetchCache.set(key, loadRef.current());
    }
  }, [lazyRoute.route.id]);

  return useMemo(
    () => ({
      onMouseEnter: triggerPrefetch,
      onFocus: triggerPrefetch,
    }),
    [triggerPrefetch],
  );
};
