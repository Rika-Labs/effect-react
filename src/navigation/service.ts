import {
  Cause,
  Context,
  Effect,
  Fiber,
  Layer,
  Option,
  Ref,
  type Schema,
  type Stream,
  SubscriptionRef,
} from "effect";
import { Boundary } from "../boundary";
import { Telemetry } from "../kernel/telemetry";
import { buildHref, matchRoute, normalizeSearchText, parseHref } from "./matcher";
import {
  type AnyLoaderDefinition,
  type AnyRouteDefinition,
  type LoaderSnapshotEntry,
  NavigationCancelledError,
  type NavigationSnapshot,
  NavigationRuntimeError,
} from "./types";
import type { NavigationError } from "./types";

const describeUnknown = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const initialSnapshot: NavigationSnapshot = {
  pathname: "/",
  searchText: "",
  href: "/",
  status: "idle",
  match: null,
  loaders: {},
  error: undefined,
};

const toLoadersByName = (loaders: readonly AnyLoaderDefinition[]): ReadonlyMap<string, AnyLoaderDefinition> =>
  new Map(loaders.map((loader) => [loader.name, loader] as const));

const planLoaderBatches = (
  loaders: readonly AnyLoaderDefinition[],
): Effect.Effect<readonly (readonly AnyLoaderDefinition[])[], NavigationRuntimeError, never> => {
  const byName = toLoadersByName(loaders);
  const depthByName = new Map<string, number>();
  const visiting = new Set<string>();

  const resolveDepth = (name: string): Effect.Effect<number, NavigationRuntimeError, never> => {
    const cached = depthByName.get(name);
    if (cached !== undefined) {
      return Effect.succeed(cached);
    }

    if (visiting.has(name)) {
      return Effect.fail(new NavigationRuntimeError(`Cyclic loader dependency detected at ${name}`));
    }

    const loader = byName.get(name);
    if (loader === undefined) {
      return Effect.fail(new NavigationRuntimeError(`Loader dependency '${name}' is not registered`));
    }

    visiting.add(name);

    const dependencies = loader.dependsOn ?? [];
    return Effect.forEach(dependencies, resolveDepth).pipe(
      Effect.map((depths) => {
        const depth = depths.length === 0 ? 0 : Math.max(...depths) + 1;
        depthByName.set(name, depth);
        visiting.delete(name);
        return depth;
      }),
      Effect.catchAll((error) => {
        visiting.delete(name);
        return Effect.fail(error);
      }),
    );
  };

  return Effect.gen(function* () {
    const entries = yield* Effect.forEach(loaders, (loader) =>
      Effect.map(resolveDepth(loader.name), (depth) => [depth, loader] as const),
    );

    const grouped = new Map<number, AnyLoaderDefinition[]>();
    for (const [depth, loader] of entries) {
      const existing = grouped.get(depth);
      if (existing === undefined) {
        grouped.set(depth, [loader]);
      } else {
        existing.push(loader);
      }
    }

    const depths = Array.from(grouped.keys()).sort((a, b) => a - b);
    return depths.map((depth) => grouped.get(depth) ?? []);
  });
};

export interface NavigationService {
  readonly navigate: (href: string) => Effect.Effect<NavigationSnapshot, NavigationError, never>;
  readonly revalidate: () => Effect.Effect<NavigationSnapshot, NavigationError, never>;
  readonly getSnapshot: Effect.Effect<NavigationSnapshot, never, never>;
  readonly hydrateSnapshot: (snapshot: NavigationSnapshot) => Effect.Effect<void, never, never>;
  readonly snapshots: Stream.Stream<NavigationSnapshot>;
}

export class Navigation extends Context.Tag("EffectReact/Navigation")<
  Navigation,
  NavigationService
>() {}

export interface MakeNavigationLayerOptions {
  readonly routes: readonly AnyRouteDefinition[];
  readonly loaders?: readonly AnyLoaderDefinition[];
  readonly initialHref?: string;
}

export const makeNavigationLayer = (
  options: MakeNavigationLayerOptions,
): Layer.Layer<Navigation, never, Boundary | Telemetry> => {
  const loaders = options.loaders ?? [];
  const initial = parseHref(options.initialHref ?? "/");

  return Layer.effect(
    Navigation,
    Effect.gen(function* () {
      const boundary = yield* Boundary;
      const telemetry = yield* Telemetry;
      const snapshotsRef = yield* SubscriptionRef.make<NavigationSnapshot>({
        ...initialSnapshot,
        pathname: initial.pathname,
        searchText: initial.searchText,
        href: buildHref(initial.pathname, initial.searchText),
      });
      const activeFiberRef = yield* Ref.make<Option.Option<Fiber.RuntimeFiber<NavigationSnapshot, NavigationError>>>(Option.none());

      const runLoaders = (
        snapshot: NavigationSnapshot,
      ): Effect.Effect<Readonly<Record<string, LoaderSnapshotEntry>>, NavigationRuntimeError, never> =>
        Effect.gen(function* () {
          if (snapshot.match === null) {
            return {};
          }

          const routeLoaders = loaders.filter((loader) => loader.routeId === snapshot.match!.route.id);
          if (routeLoaders.length === 0) {
            return {};
          }

          const batches = yield* planLoaderBatches(routeLoaders);
          const results: Record<string, unknown> = {};
          const states: Record<string, LoaderSnapshotEntry> = {};

          for (const loader of routeLoaders) {
            states[loader.name] = { _tag: "pending" };
          }

          yield* SubscriptionRef.update(snapshotsRef, (current) => ({
            ...current,
            loaders: {
              ...current.loaders,
              ...states,
            },
          }));

          for (const batch of batches) {
            const exits = yield* Effect.all(
              batch.map((loader) => {
                const base = loader.run({
                  route: snapshot.match!.route,
                  pathname: snapshot.pathname,
                  searchText: snapshot.searchText,
                  params: snapshot.match!.params,
                  search: snapshot.match!.search,
                  dependencyResults: results,
                });

                const withRetry = loader.retry ? Effect.retry(base, loader.retry) : base;
                return Effect.exit(withRetry).pipe(Effect.map((exit) => [loader, exit] as const));
              }),
              {
                concurrency: "unbounded",
              },
            );

            for (const [loader, exit] of exits) {
              if (exit._tag === "Success") {
                results[loader.name] = exit.value;
                states[loader.name] = {
                  _tag: "success",
                  value: exit.value,
                };
                continue;
              }

              const failure = Cause.failureOption(exit.cause);
              states[loader.name] = {
                _tag: "failure",
                error: failure._tag === "Some" ? failure.value : Cause.pretty(exit.cause),
              };

              yield* SubscriptionRef.update(snapshotsRef, (current) => ({
                ...current,
                status: "failure",
                loaders: {
                  ...current.loaders,
                  ...states,
                },
                error: states[loader.name],
              }) satisfies NavigationSnapshot);

              return yield* Effect.fail(
                new NavigationRuntimeError(`Loader '${loader.name}' failed for route '${snapshot.match!.route.id}'`),
              );
            }

            yield* SubscriptionRef.update(snapshotsRef, (current) => ({
              ...current,
              loaders: {
                ...current.loaders,
                ...states,
              },
            }) satisfies NavigationSnapshot);
          }

          return states;
        });

      const performNavigation = (
        href: string,
      ): Effect.Effect<NavigationSnapshot, NavigationError, never> =>
        Effect.gen(function* () {
          const { pathname, searchText } = parseHref(href);
          const searchParams = new URLSearchParams(searchText);

          const candidate = options.routes.find((route) => matchRoute({
            routes: [route],
            pathname,
            search: {},
          }) !== null);

          const decodedSearch =
            candidate?.search === undefined
              ? Effect.succeed({} as unknown)
              : boundary.decodeUnknown({
                  source: `route:${candidate.id}:search`,
                  schema: candidate.search as Schema.Schema<unknown, unknown, never>,
                  value: Object.fromEntries(searchParams.entries()),
                });

          const search = yield* decodedSearch;
          const matched = matchRoute({
            routes: options.routes,
            pathname,
            search,
          });

          if (matched === null) {
            return yield* Effect.fail(
              new NavigationRuntimeError(`No route matched pathname '${pathname}'`),
            );
          }

          yield* telemetry.emit({
            _tag: "navigation",
            phase: "start",
            pathname,
            routeId: matched.route.id,
            timestamp: Date.now(),
          });

          const loadingSnapshot: NavigationSnapshot = {
            pathname,
            searchText: normalizeSearchText(searchText),
            href: buildHref(pathname, normalizeSearchText(searchText)),
            status: "loading",
            match: matched,
            loaders: {},
            error: undefined,
          };

          yield* SubscriptionRef.set(snapshotsRef, loadingSnapshot);

          const loaderStates = yield* runLoaders(loadingSnapshot);

          const completed: NavigationSnapshot = {
            ...loadingSnapshot,
            status: "success",
            loaders: loaderStates,
            error: undefined,
          };

          yield* SubscriptionRef.set(snapshotsRef, completed);
          yield* telemetry.emit({
            _tag: "navigation",
            phase: "success",
            pathname,
            routeId: matched.route.id,
            timestamp: Date.now(),
          });

          return completed;
        });

      const navigate: NavigationService["navigate"] = (href) =>
        Effect.gen(function* () {
          const previous = yield* Ref.getAndSet(activeFiberRef, Option.none());
          if (Option.isSome(previous)) {
            yield* Fiber.interrupt(previous.value);
            yield* telemetry.emit({
              _tag: "navigation",
              phase: "cancel",
              pathname: href,
              timestamp: Date.now(),
            });
          }

          const fiber = yield* Effect.fork(performNavigation(href));
          yield* Ref.set(activeFiberRef, Option.some(fiber));

          const exit = yield* Effect.exit(Fiber.join(fiber));

          const current = yield* Ref.get(activeFiberRef);
          if (Option.isSome(current) && current.value === fiber) {
            yield* Ref.set(activeFiberRef, Option.none());
          }

          if (exit._tag === "Success") {
            return exit.value;
          }

          if (Cause.isInterruptedOnly(exit.cause)) {
            return yield* Effect.fail(new NavigationCancelledError(href));
          }

          const failure = Cause.failureOption(exit.cause);
          if (failure._tag === "Some") {
            return yield* Effect.fail(
              failure.value instanceof NavigationRuntimeError
                ? failure.value
                : new NavigationRuntimeError(describeUnknown(failure.value)),
            );
          }

          return yield* Effect.fail(new NavigationRuntimeError(Cause.pretty(exit.cause)));
        }).pipe(
          Effect.tapError((error) =>
            telemetry.emit({
              _tag: "navigation",
              phase: "failure",
              pathname: href,
              timestamp: Date.now(),
              detail: error,
            }),
          ),
        );

      const revalidate: NavigationService["revalidate"] =
        () =>
          Effect.gen(function* () {
            const snapshot = yield* SubscriptionRef.get(snapshotsRef);
            return yield* navigate(snapshot.href);
          });

      return {
        navigate,
        revalidate,
        getSnapshot: SubscriptionRef.get(snapshotsRef),
        hydrateSnapshot: (snapshot) => SubscriptionRef.set(snapshotsRef, snapshot),
        snapshots: snapshotsRef.changes,
      } satisfies NavigationService;
    }),
  );
};

export const navigateTo = (
  href: string,
): Effect.Effect<NavigationSnapshot, NavigationError, Navigation> =>
  Effect.flatMap(Navigation, (service) => service.navigate(href));
