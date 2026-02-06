import { Effect } from "effect";
import type { AnyRoute, AnyRouteLoader } from "../router";

export interface RouteManifestModule {
  readonly routeFiles: readonly string[];
  readonly loadRouteModule: (sourcePath: string) => Promise<unknown>;
}

export type RouteRegistryError =
  | {
      readonly _tag: "route_module_load_error";
      readonly sourcePath: string;
      readonly cause: unknown;
    }
  | {
      readonly _tag: "route_export_not_found";
      readonly sourcePath: string;
    };

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
};

const isRouteLike = (value: unknown): value is AnyRoute => {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return (
    typeof record["id"] === "string" &&
    typeof record["path"] === "string" &&
    typeof record["matchPath"] === "function" &&
    typeof record["buildHref"] === "function"
  );
};

const isRouteLoaderLike = (value: unknown): value is AnyRouteLoader => {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return isRouteLike(record["route"]) && typeof record["run"] === "function";
};

const findRouteFromModule = (moduleValue: unknown): AnyRoute | undefined => {
  if (isRouteLike(moduleValue)) {
    return moduleValue;
  }

  const record = asRecord(moduleValue);
  if (record === undefined) {
    return undefined;
  }

  const direct = record["route"];
  if (isRouteLike(direct)) {
    return direct;
  }

  for (const value of Object.values(record)) {
    if (isRouteLike(value)) {
      return value;
    }
  }

  return undefined;
};

const findLoadersFromModule = (moduleValue: unknown): readonly AnyRouteLoader[] => {
  if (isRouteLoaderLike(moduleValue)) {
    return [moduleValue];
  }

  const record = asRecord(moduleValue);
  if (record === undefined) {
    return [];
  }

  const loaders: AnyRouteLoader[] = [];
  for (const value of Object.values(record)) {
    if (isRouteLoaderLike(value)) {
      loaders.push(value);
    }
  }

  return loaders;
};

export const loadRoutesFromManifest = (
  manifest: RouteManifestModule,
): Effect.Effect<readonly AnyRoute[], RouteRegistryError, never> =>
  Effect.forEach(manifest.routeFiles, (sourcePath) =>
    Effect.tryPromise({
      try: () => manifest.loadRouteModule(sourcePath),
      catch: (cause) =>
        ({
          _tag: "route_module_load_error",
          sourcePath,
          cause,
        }) satisfies RouteRegistryError,
    }).pipe(
      Effect.flatMap((moduleValue) => {
        const route = findRouteFromModule(moduleValue);
        if (route === undefined) {
          return Effect.fail<RouteRegistryError>({
            _tag: "route_export_not_found",
            sourcePath,
          });
        }
        return Effect.succeed(route);
      }),
    ),
  );

export const loadRouteLoadersFromManifest = (
  manifest: RouteManifestModule,
): Effect.Effect<readonly AnyRouteLoader[], RouteRegistryError, never> =>
  Effect.forEach(manifest.routeFiles, (sourcePath) =>
    Effect.tryPromise({
      try: () => manifest.loadRouteModule(sourcePath),
      catch: (cause) =>
        ({
          _tag: "route_module_load_error",
          sourcePath,
          cause,
        }) satisfies RouteRegistryError,
    }).pipe(Effect.map((moduleValue) => findLoadersFromModule(moduleValue))),
  ).pipe(
    Effect.map((groups) => {
      const deduped = new Map<string, AnyRouteLoader>();
      for (const group of groups) {
        for (const loader of group) {
          if (!deduped.has(loader.route.id)) {
            deduped.set(loader.route.id, loader);
          }
        }
      }
      return Array.from(deduped.values());
    }),
  );
