import { buildHref } from "../navigation/matcher";
import type { AnyRouteDefinition, RouteDefinition } from "./types";

type ExtractSegmentParam<Segment extends string> =
  Segment extends `:${infer Param}` ? Param : never;

type ExtractPathParams<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? ExtractSegmentParam<Head> | ExtractPathParams<Tail>
    : ExtractSegmentParam<Path>;

type SearchPrimitive = string | number | boolean;
type SearchFieldInput<Value> =
  Value extends readonly (infer Item)[]
    ? Item | readonly Item[] | null | undefined
    : Value | readonly Value[] | null | undefined;

type SearchFallback = Readonly<Record<string, SearchPrimitive | readonly SearchPrimitive[] | null | undefined>>;

export type RoutePathParams<Path extends string> =
  [ExtractPathParams<Path>] extends [never]
    ? Record<never, never>
    : {
        readonly [K in ExtractPathParams<Path>]: string | number | boolean;
      };

export type RouteSearchInput<TRoute extends AnyRouteDefinition> =
  TRoute extends RouteDefinition<string, infer Search, unknown>
    ? {
        readonly [K in keyof Search]?: SearchFieldInput<Search[K]>;
      }
    : SearchFallback;

export interface RouteHrefOptions<TRoute extends AnyRouteDefinition> {
  readonly params?: RoutePathParams<TRoute["path"]>;
  readonly search?: RouteSearchInput<TRoute>;
}

export interface RouteUrlOptions<TRoute extends AnyRouteDefinition>
  extends RouteHrefOptions<TRoute> {
  readonly base?: string | URL;
}

const PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

const appendSearchValue = (
  params: URLSearchParams,
  key: string,
  value: unknown,
): void => {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      appendSearchValue(params, key, nestedValue);
    }
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    params.append(key, String(value));
  }
};

const defaultBase = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost";
  }
  return window.location.origin;
};

export const routeSearchText = (search?: SearchFallback): string => {
  if (search === undefined) {
    return "";
  }

  const params = new URLSearchParams();
  const keys = Object.keys(search).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    appendSearchValue(params, key, search[key]);
  }

  const text = params.toString();
  return text.length > 0 ? `?${text}` : "";
};

export const routePath = <TRoute extends AnyRouteDefinition>(
  route: TRoute,
  params?: RoutePathParams<TRoute["path"]>,
): string =>
  route.path.replace(PARAM_PATTERN, (_match, name: string) => {
    const value = (params as Readonly<Record<string, string | number | boolean>> | undefined)?.[name];
    if (value === undefined) {
      throw new Error(`Missing route param '${name}' for route '${route.id}'`);
    }
    return encodeURIComponent(String(value));
  });

export const routeHref = <TRoute extends AnyRouteDefinition>(
  route: TRoute,
  options: RouteHrefOptions<TRoute> = {},
): string =>
  buildHref(
    routePath(route, options.params),
    routeSearchText(options.search as SearchFallback | undefined),
  );

export const routeUrl = <TRoute extends AnyRouteDefinition>(
  route: TRoute,
  options: RouteUrlOptions<TRoute> = {},
): URL =>
  new URL(
    routeHref(route, options),
    options.base ?? defaultBase(),
  );
