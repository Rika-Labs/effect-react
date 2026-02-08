import type { Effect, Layer } from "effect";
import type { ComponentType } from "react";
import type {
  AnyLoaderDefinition,
  AnyRouteDefinition,
} from "../navigation";
import type { CachePolicy } from "./cache";

export interface PageDefinition<TRoute extends AnyRouteDefinition = AnyRouteDefinition> {
  readonly id: string;
  readonly route: TRoute;
  readonly loader?: AnyLoaderDefinition;
  readonly cache?: CachePolicy;
  readonly component: ComponentType;
}

export type AnyPageDefinition = PageDefinition<AnyRouteDefinition>;

export interface LayoutDefinition {
  readonly id: string;
  readonly component: ComponentType<{
    readonly children?: unknown;
  }>;
  readonly loader?: AnyLoaderDefinition;
}

export interface MiddlewareDefinition<R = never> {
  readonly provide?: Layer.Layer<R, never, never>;
  readonly use: (options: {
    readonly request: Request;
    readonly next: () => Effect.Effect<Response, unknown, R>;
  }) => Effect.Effect<Response, unknown, R>;
}

export const definePage = <TRoute extends AnyRouteDefinition>(
  page: PageDefinition<TRoute>,
): PageDefinition<TRoute> => page;

export const defineLayout = (layout: LayoutDefinition): LayoutDefinition => layout;

export const defineMiddleware = <R>(
  middleware: MiddlewareDefinition<R>,
): MiddlewareDefinition<R> => middleware;

export type { CachePolicy } from "./cache";

export {
  defineRoute,
  defineLoader,
  type RouteDefinition,
  type LoaderDefinition,
  type AnyRouteDefinition,
  type AnyLoaderDefinition,
} from "../navigation";

export {
  defineAction,
  type ActionDefinition,
  type AnyActionDefinition,
} from "../actions";
