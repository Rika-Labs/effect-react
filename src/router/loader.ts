import { Cause, Effect, Exit, Option } from "effect";
import type { EffectRuntime } from "../internal/runtimeContext";
import type { AnyRoute, MatchChainEntry, RouteLocation } from "./types";

export interface RouteLoaderContext<TRoute extends AnyRoute> {
  readonly location: RouteLocation<TRoute>;
  readonly signal?: AbortSignal;
  readonly parentData?: unknown;
}

export interface RouteLoader<TRoute extends AnyRoute, A, E, R = never> {
  readonly route: TRoute;
  readonly run: (context: RouteLoaderContext<TRoute>) => Effect.Effect<A, E, R>;
}

type AnyRouteLoaderRun = {
  bivarianceHack: (context: RouteLoaderContext<AnyRoute>) => Effect.Effect<unknown, unknown, never>;
}["bivarianceHack"];

export interface AnyRouteLoader {
  readonly route: AnyRoute;
  readonly run: AnyRouteLoaderRun;
}

export const asAnyRouteLoader = <TRoute extends AnyRoute, A, E>(
  loader: RouteLoader<TRoute, A, E, never>,
): AnyRouteLoader => loader as unknown as AnyRouteLoader;

export const defineRouteLoader = <TRoute extends AnyRoute, A, E, R = never>(
  loader: RouteLoader<TRoute, A, E, R>,
): RouteLoader<TRoute, A, E, R> => loader;

export type RouteLoaderResult<A, E> =
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
    };

export type RouteLoaderSnapshotEntry =
  | {
      readonly _tag: "pending";
    }
  | {
      readonly _tag: "success";
      readonly value: unknown;
    }
  | {
      readonly _tag: "failure";
      readonly error: unknown;
    }
  | {
      readonly _tag: "defect";
      readonly message: string;
    };

export type RouteLoaderSnapshot = Readonly<Record<string, RouteLoaderSnapshotEntry>>;

const parseSearchForRoute = (route: AnyRoute, searchText: string): unknown => {
  const search = new URLSearchParams(searchText);
  return route.searchAdapter?.parse(search) ?? {};
};

const buildLoaderLocation = (
  entry: MatchChainEntry,
  pathname: string,
  searchText: string,
): RouteLocation<AnyRoute> => {
  const href = searchText.length > 0 ? `${pathname}${searchText}` : pathname;
  return {
    route: entry.route,
    pathname,
    href,
    params: entry.params,
    search: parseSearchForRoute(entry.route, searchText),
  };
};

export const createPendingRouteLoaderSnapshot = (
  chain: readonly MatchChainEntry[],
  loaders: readonly AnyRouteLoader[],
): RouteLoaderSnapshot => {
  const loaderIds = new Set(loaders.map((loader) => loader.route.id));
  const pending: Record<string, RouteLoaderSnapshotEntry> = {};

  for (const entry of chain) {
    if (loaderIds.has(entry.route.id)) {
      pending[entry.route.id] = { _tag: "pending" };
    }
  }

  return pending;
};

export interface RunRouteLoaderChainOptions {
  readonly runtime: EffectRuntime;
  readonly chain: readonly MatchChainEntry[];
  readonly loaders: readonly AnyRouteLoader[];
  readonly pathname: string;
  readonly searchText: string;
  readonly signal?: AbortSignal;
}

const toRouteLoaderResult = <A, E>(exit: Exit.Exit<A, E>): RouteLoaderResult<A, E> => {
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

export const runRouteLoaderChainEffect = (
  options: RunRouteLoaderChainOptions,
): Effect.Effect<RouteLoaderSnapshot, never, never> => {
  const byRouteId = new Map(options.loaders.map((loader) => [loader.route.id, loader] as const));
  const snapshot = {
    ...createPendingRouteLoaderSnapshot(options.chain, options.loaders),
  };

  const runNext = (
    index: number,
    parentData: unknown,
  ): Effect.Effect<RouteLoaderSnapshot, never, never> => {
    if (index >= options.chain.length) {
      return Effect.succeed(snapshot);
    }

    const entry = options.chain[index]!;
    const loader = byRouteId.get(entry.route.id);
    if (loader === undefined) {
      return runNext(index + 1, parentData);
    }

    const location = buildLoaderLocation(entry, options.pathname, options.searchText);
    return Effect.flatMap(
      runRouteLoaderEffect(
        options.runtime,
        loader as RouteLoader<AnyRoute, unknown, unknown, never>,
        {
          location,
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
          ...(parentData !== undefined ? { parentData } : {}),
        },
      ),
      (result) => {
        if (result._tag === "success") {
          snapshot[entry.route.id] = {
            _tag: "success",
            value: result.value,
          };
          return runNext(index + 1, result.value);
        }

        if (result._tag === "failure") {
          snapshot[entry.route.id] = {
            _tag: "failure",
            error: result.error,
          };
          return Effect.succeed(snapshot);
        }

        snapshot[entry.route.id] = {
          _tag: "defect",
          message: result.message,
        };
        return Effect.succeed(snapshot);
      },
    );
  };

  return runNext(0, undefined);
};

export const runRouteLoaderChain = (
  options: RunRouteLoaderChainOptions,
): Promise<RouteLoaderSnapshot> => Effect.runPromise(runRouteLoaderChainEffect(options));

export const runRouteLoaderEffect = <TRoute extends AnyRoute, A, E>(
  runtime: EffectRuntime,
  loader: RouteLoader<TRoute, A, E, never>,
  context: RouteLoaderContext<TRoute>,
): Effect.Effect<RouteLoaderResult<A, E>, never, never> => {
  const runOptions = context.signal === undefined ? undefined : { signal: context.signal };
  return Effect.match(
    Effect.tryPromise({
      try: () => runtime.runPromiseExit(Effect.scoped(loader.run(context)), runOptions),
      catch: (cause) =>
        ({
          _tag: "defect" as const,
          message: Cause.pretty(Cause.die(cause)),
        }) satisfies RouteLoaderResult<A, E>,
    }),
    {
      onFailure: (result) => result,
      onSuccess: (exit) => toRouteLoaderResult(exit),
    },
  );
};

export const runRouteLoader = <TRoute extends AnyRoute, A, E>(
  runtime: EffectRuntime,
  loader: RouteLoader<TRoute, A, E, never>,
  context: RouteLoaderContext<TRoute>,
): Promise<RouteLoaderResult<A, E>> =>
  Effect.runPromise(runRouteLoaderEffect(runtime, loader, context));
