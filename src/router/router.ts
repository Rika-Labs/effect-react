import { createExternalStore, type ExternalStore } from "../internal/externalStore";
import { Effect } from "effect";
import {
  createPendingRouteLoaderSnapshot,
  runRouteLoaderChainEffect,
  type AnyRouteLoader,
  type RouteLoaderSnapshot,
} from "./loader";
import { matchNestedRoutes } from "./route";
import type { AnyRoute, MatchChainEntry, NavigateRouteOptions, RouteLocation } from "./types";
import type { EffectRuntime } from "../internal/runtimeContext";

export interface RouterSnapshot<TRoutes extends readonly AnyRoute[]> {
  readonly pathname: string;
  readonly searchText: string;
  readonly href: string;
  readonly match: RouteLocation<TRoutes[number]> | null;
  readonly matchChain: readonly MatchChainEntry[];
  readonly loaderState: RouteLoaderSnapshot;
  readonly loadersPending: boolean;
}

export interface RouterHistoryLocation {
  readonly pathname: string;
  readonly search: string;
}

export interface RouterHistory {
  readonly location: RouterHistoryLocation;
  readonly push: (href: string) => void;
  readonly replace: (href: string) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface CreateRouterOptions<TRoutes extends readonly AnyRoute[]> {
  readonly routes: TRoutes;
  readonly history?: RouterHistory;
  readonly initialHref?: string;
  readonly runtime?: EffectRuntime;
  readonly loaders?: readonly AnyRouteLoader[];
  readonly initialLoaderState?: RouteLoaderSnapshot;
}

export interface Router<TRoutes extends readonly AnyRoute[]> {
  readonly routes: TRoutes;
  readonly getSnapshot: () => RouterSnapshot<TRoutes>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly navigatePath: (path: string, options?: { readonly replace?: boolean }) => void;
  readonly navigate: <TRoute extends TRoutes[number]>(
    route: TRoute,
    options?: NavigateRouteOptions<TRoute>,
  ) => void;
  readonly match: <TRoute extends TRoutes[number]>(route: TRoute) => RouteLocation<TRoute> | null;
  readonly revalidate: (options?: { readonly signal?: AbortSignal }) => Promise<void>;
}

interface BrowserLike {
  readonly location: {
    readonly pathname: string;
    readonly search: string;
  };
  readonly history: {
    readonly pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
    readonly replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  };
  readonly addEventListener: (type: "popstate", listener: () => void) => void;
  readonly removeEventListener: (type: "popstate", listener: () => void) => void;
}

const normalizePathname = (path: string): string => {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
};

const normalizeSearch = (search: string): string => {
  if (search.length === 0 || search === "?") {
    return "";
  }
  return search.startsWith("?") ? search : `?${search}`;
};

const splitHref = (href: string): RouterHistoryLocation => {
  const [rawPath, ...searchParts] = href.split("?");
  const pathname = normalizePathname(rawPath ?? "/");
  const searchText = searchParts.length === 0 ? "" : `?${searchParts.join("?")}`;
  return {
    pathname,
    search: normalizeSearch(searchText),
  };
};

const scoreRoute = (route: AnyRoute): number => {
  const segments = route.path === "/" ? [] : route.path.slice(1).split("/");
  return segments.reduce((score, segment) => {
    if (segment === "*") {
      return score;
    }
    if (segment.startsWith(":")) {
      return score + 1;
    }
    return score + 3;
  }, 0);
};

const createMemoryHistory = (initialHref: string): RouterHistory => {
  let current = splitHref(initialHref);
  const listeners = new Set<() => void>();

  const notify = () => {
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
      listener();
    }
  };

  return {
    get location() {
      return current;
    },
    push: (href) => {
      current = splitHref(href);
      notify();
    },
    replace: (href) => {
      current = splitHref(href);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const createBrowserHistory = (target: BrowserLike): RouterHistory => {
  const listeners = new Set<() => void>();

  const notify = () => {
    const snapshot = Array.from(listeners);
    for (const listener of snapshot) {
      listener();
    }
  };

  const onPopState = () => {
    notify();
  };

  return {
    get location() {
      return {
        pathname: normalizePathname(target.location.pathname),
        search: normalizeSearch(target.location.search),
      };
    },
    push: (href) => {
      target.history.pushState(null, "", href);
      notify();
    },
    replace: (href) => {
      target.history.replaceState(null, "", href);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        target.addEventListener("popstate", onPopState);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          target.removeEventListener("popstate", onPopState);
        }
      };
    },
  };
};

const resolveDefaultHistory = (initialHref: string): RouterHistory => {
  if (typeof window === "undefined") {
    return createMemoryHistory(initialHref);
  }
  return createBrowserHistory(window as unknown as BrowserLike);
};

const hasNestedRoutes = (routes: readonly AnyRoute[]): boolean =>
  routes.some(
    (route) => (route.children !== undefined && route.children.length > 0) || route.layout === true,
  );

const createSnapshot = <TRoutes extends readonly AnyRoute[]>(
  routes: TRoutes,
  location: RouterHistoryLocation,
  loaderState: RouteLoaderSnapshot,
  loadersPending: boolean,
): RouterSnapshot<TRoutes> => {
  const pathname = normalizePathname(location.pathname);
  const searchText = normalizeSearch(location.search);
  const searchParams = new URLSearchParams(searchText);
  const href = searchText.length > 0 ? `${pathname}${searchText}` : pathname;

  if (hasNestedRoutes(routes)) {
    const chain = matchNestedRoutes(routes, pathname);
    if (chain !== null && chain.length > 0) {
      const leaf = chain[chain.length - 1]!;
      const parsedSearch = leaf.route.searchAdapter?.parse(searchParams) ?? {};
      return {
        pathname,
        searchText,
        href,
        match: {
          route: leaf.route,
          pathname,
          href,
          params: leaf.params,
          search: parsedSearch,
        } as RouteLocation<TRoutes[number]>,
        matchChain: chain,
        loaderState,
        loadersPending,
      };
    }
  }

  const sortedRoutes = [...routes].sort((left, right) => scoreRoute(right) - scoreRoute(left));
  for (const route of sortedRoutes) {
    const matched = route.matchPath(pathname);
    if (matched === null) {
      continue;
    }

    const parsedSearch = route.searchAdapter?.parse(searchParams) ?? {};
    return {
      pathname,
      searchText,
      href,
      match: {
        route,
        pathname,
        href,
        params: matched.params,
        search: parsedSearch,
      } as RouteLocation<TRoutes[number]>,
      matchChain: [
        {
          route,
          params: matched.params as Readonly<Record<string, string>>,
          pathname: matched.pathname,
        },
      ],
      loaderState,
      loadersPending,
    };
  }

  return {
    pathname,
    searchText,
    href,
    match: null,
    matchChain: [],
    loaderState,
    loadersPending,
  };
};

const buildHrefFromPath = (path: string): string => {
  const location = splitHref(path);
  return `${location.pathname}${location.search}`;
};

export const createRouter = <TRoutes extends readonly AnyRoute[]>(
  options: CreateRouterOptions<TRoutes>,
): Router<TRoutes> => {
  const initialHref = options.initialHref ?? "/";
  const history = options.history ?? resolveDefaultHistory(initialHref);
  const loaders = options.loaders ?? [];
  const runtime = options.runtime;

  let loaderState: RouteLoaderSnapshot = options.initialLoaderState ?? {};
  let loadersPending = false;
  let activeLoaderController: AbortController | null = null;
  let activeLoaderRun = 0;

  const store: ExternalStore<RouterSnapshot<TRoutes>> = createExternalStore(
    createSnapshot(options.routes, history.location, loaderState, loadersPending),
  );

  const syncSnapshot = (): void => {
    store.setSnapshot(
      createSnapshot(options.routes, history.location, loaderState, loadersPending),
    );
  };

  const runLoadersEffect = (runOptions?: {
    readonly signal?: AbortSignal;
  }): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      if (runtime === undefined || loaders.length === 0) {
        loadersPending = false;
        syncSnapshot();
        return;
      }

      const snapshot = store.getSnapshot();
      if (snapshot.matchChain.length === 0) {
        loaderState = {};
        loadersPending = false;
        syncSnapshot();
        return;
      }

      activeLoaderController?.abort();
      const controller = new AbortController();
      activeLoaderController = controller;
      if (runOptions?.signal !== undefined) {
        runOptions.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      const runId = activeLoaderRun + 1;
      activeLoaderRun = runId;

      loaderState = createPendingRouteLoaderSnapshot(snapshot.matchChain, loaders);
      loadersPending = true;
      syncSnapshot();

      const nextLoaderState = yield* runRouteLoaderChainEffect({
        runtime,
        chain: snapshot.matchChain,
        loaders,
        pathname: snapshot.pathname,
        searchText: snapshot.searchText,
        signal: controller.signal,
      });

      if (runId !== activeLoaderRun) {
        return;
      }

      loaderState = nextLoaderState;
      loadersPending = false;
      syncSnapshot();
    });

  const runLoaders = (runOptions?: { readonly signal?: AbortSignal }): Promise<void> =>
    Effect.runPromise(runLoadersEffect(runOptions));

  history.subscribe(() => {
    syncSnapshot();
    void Effect.runPromise(runLoadersEffect());
  });

  void Effect.runPromise(runLoadersEffect());

  const navigatePath = (path: string, navigateOptions?: { readonly replace?: boolean }): void => {
    const href = buildHrefFromPath(path);
    if (navigateOptions?.replace === true) {
      history.replace(href);
      return;
    }
    history.push(href);
  };

  const navigate = <TRoute extends TRoutes[number]>(
    route: TRoute,
    navigateOptions?: NavigateRouteOptions<TRoute>,
  ): void => {
    const href = route.buildHref(navigateOptions as never);
    if (navigateOptions?.replace === true) {
      history.replace(href);
      return;
    }
    history.push(href);
  };

  const match = <TRoute extends TRoutes[number]>(route: TRoute): RouteLocation<TRoute> | null => {
    const snapshot = store.getSnapshot();
    if (snapshot.match === null || snapshot.match.route.id !== route.id) {
      return null;
    }
    return snapshot.match as RouteLocation<TRoute>;
  };

  return {
    routes: options.routes,
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    navigatePath,
    navigate,
    match,
    revalidate: (runOptions) => runLoaders(runOptions),
  };
};

export const createMemoryRouterHistory = (initialHref = "/"): RouterHistory =>
  createMemoryHistory(initialHref);
