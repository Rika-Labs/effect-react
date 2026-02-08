import type { AnyRouteDefinition, RouteMatch } from "./types";

const normalizePathname = (pathname: string): string => {
  if (pathname.length === 0) {
    return "/";
  }
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
};

const scoreRoute = (path: string): number => {
  if (path === "/") {
    return 10;
  }
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .reduce((score, segment) => {
      if (segment === "*") {
        return score;
      }
      if (segment.startsWith(":")) {
        return score + 2;
      }
      return score + 5;
    }, 0);
};

const splitSegments = (path: string): readonly string[] =>
  normalizePathname(path)
    .split("/")
    .filter((segment) => segment.length > 0);

const matchRoutePath = (
  routePath: string,
  pathname: string,
): Readonly<Record<string, string>> | null => {
  const routeSegments = splitSegments(routePath);
  const pathSegments = splitSegments(pathname);

  const params: Record<string, string> = {};
  let i = 0;
  let j = 0;

  while (i < routeSegments.length && j < pathSegments.length) {
    const routeSegment = routeSegments[i]!;
    const pathSegment = pathSegments[j]!;

    if (routeSegment === "*") {
      return params;
    }

    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
      i += 1;
      j += 1;
      continue;
    }

    if (routeSegment !== pathSegment) {
      return null;
    }

    i += 1;
    j += 1;
  }

  if (i < routeSegments.length && routeSegments[i] === "*") {
    return params;
  }

  if (i !== routeSegments.length || j !== pathSegments.length) {
    return null;
  }

  return params;
};

export interface MatchInput {
  readonly routes: readonly AnyRouteDefinition[];
  readonly pathname: string;
  readonly search: unknown;
}

export const matchRoute = ({ routes, pathname, search }: MatchInput): RouteMatch<AnyRouteDefinition> | null => {
  const normalized = normalizePathname(pathname);
  const sorted = [...routes].sort((a, b) => scoreRoute(b.path) - scoreRoute(a.path));

  for (const route of sorted) {
    const params = matchRoutePath(route.path, normalized);
    if (params !== null) {
      return {
        route,
        pathname: normalized,
        params,
        search,
      };
    }
  }

  return null;
};

export const buildHref = (pathname: string, searchText: string): string =>
  searchText.length > 0 ? `${normalizePathname(pathname)}${searchText}` : normalizePathname(pathname);

export const normalizeSearchText = (searchText: string): string => {
  if (searchText.length === 0 || searchText === "?") {
    return "";
  }
  return searchText.startsWith("?") ? searchText : `?${searchText}`;
};

export const parseHref = (href: string): { readonly pathname: string; readonly searchText: string } => {
  const [pathPart, ...searchParts] = href.split("?");
  return {
    pathname: normalizePathname(pathPart ?? "/"),
    searchText: normalizeSearchText(searchParts.length === 0 ? "" : searchParts.join("?")),
  };
};
