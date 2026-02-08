import type { Effect, Schedule, Schema } from "effect";
import type { BoundaryDecodeError } from "../boundary";

export interface RouteDefinition<Path extends string, Search, SearchEncoded = Search> {
  readonly id: string;
  readonly path: Path;
  readonly search?: Schema.Schema<Search, SearchEncoded, never>;
}

export const defineRoute = <Path extends string, Search = Record<never, never>, SearchEncoded = Search>(
  route: RouteDefinition<Path, Search, SearchEncoded>,
): RouteDefinition<Path, Search, SearchEncoded> => route;

export interface AnyRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly search?: Schema.Schema.All;
}

export interface RouteMatch<TRoute extends AnyRouteDefinition> {
  readonly route: TRoute;
  readonly pathname: string;
  readonly params: Readonly<Record<string, string>>;
  readonly search: unknown;
}

export interface LoaderContext<TRoute extends AnyRouteDefinition> {
  readonly route: TRoute;
  readonly pathname: string;
  readonly searchText: string;
  readonly params: Readonly<Record<string, string>>;
  readonly search: unknown;
  readonly dependencyResults: Readonly<Record<string, unknown>>;
}

export interface LoaderDefinition<
  Name extends string,
  RouteId extends string,
  Output,
  E,
  TRoute extends AnyRouteDefinition = AnyRouteDefinition,
> {
  readonly name: Name;
  readonly routeId: RouteId;
  readonly dependsOn?: readonly string[];
  readonly retry?: Schedule.Schedule<unknown, E, never>;
  readonly run: (context: LoaderContext<TRoute>) => Effect.Effect<Output, E, never>;
}

export const defineLoader = <
  Name extends string,
  RouteId extends string,
  Output,
  E,
  TRoute extends AnyRouteDefinition = AnyRouteDefinition,
>(
  loader: LoaderDefinition<Name, RouteId, Output, E, TRoute>,
): LoaderDefinition<Name, RouteId, Output, E, TRoute> => loader;

export type AnyLoaderDefinition = LoaderDefinition<string, string, unknown, never, AnyRouteDefinition>;

export type LoaderSnapshotEntry =
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
    };

export interface NavigationSnapshot {
  readonly pathname: string;
  readonly searchText: string;
  readonly href: string;
  readonly status: "idle" | "loading" | "success" | "failure";
  readonly match: RouteMatch<AnyRouteDefinition> | null;
  readonly loaders: Readonly<Record<string, LoaderSnapshotEntry>>;
  readonly error: unknown;
}

export class NavigationRuntimeError extends Error {
  readonly _tag = "NavigationRuntimeError" as const;

  constructor(readonly messageText: string) {
    super(messageText);
    this.name = "NavigationRuntimeError";
  }
}

export class NavigationCancelledError extends Error {
  readonly _tag = "NavigationCancelledError" as const;

  constructor(readonly pathname: string) {
    super(`Navigation cancelled for ${pathname}`);
    this.name = "NavigationCancelledError";
  }
}

export type NavigationError =
  | NavigationRuntimeError
  | NavigationCancelledError
  | BoundaryDecodeError;
