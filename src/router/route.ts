import type {
  AnyRoute,
  BuildHrefInput,
  DefineRouteOptions,
  MatchChainEntry,
  NormalizePath,
  RouteDefinition,
  RouteParams,
  RoutePathMatch,
  RouteSearchAdapter,
} from "./types";

const normalizePathname = (path: string): string => {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
};

const encodePathSegment = (value: string): string =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const splitPathSegments = (path: string): readonly string[] => {
  const normalized = normalizePathname(path);
  if (normalized === "/") {
    return [];
  }
  return normalized.slice(1).split("/");
};

const parseParamToken = (
  token: string,
): {
  readonly name: string;
  readonly optional: boolean;
  readonly splat: boolean;
} => {
  const optional = token.endsWith("?");
  const splat = token.endsWith("*");
  let name = token;
  if (optional || splat) {
    name = token.slice(0, -1);
  }
  return {
    name,
    optional,
    splat,
  };
};

const buildPathFromTemplate = <Path extends string>(
  template: NormalizePath<Path>,
  params: RouteParams<Path>,
): string => {
  const templateSegments = splitPathSegments(template);
  if (templateSegments.length === 0) {
    return "/";
  }

  const builtSegments: string[] = [];
  for (const segment of templateSegments) {
    if (!segment.startsWith(":")) {
      if (segment !== "*") {
        builtSegments.push(segment);
      }
      continue;
    }

    const token = parseParamToken(segment.slice(1));
    const value = (params as Record<string, string | undefined>)[token.name];
    if (value === undefined || value.length === 0) {
      if (!token.optional) {
        throw new Error(`Missing required route param "${token.name}" for path "${template}"`);
      }
      continue;
    }

    const encoded = encodePathSegment(value);
    if (token.splat) {
      builtSegments.push(...encoded.split("/"));
      continue;
    }

    builtSegments.push(encoded);
  }

  return `/${builtSegments.join("/")}`;
};

const matchTemplate = <Path extends string>(
  template: NormalizePath<Path>,
  pathname: string,
): RoutePathMatch<Path> | null => {
  const targetSegments = splitPathSegments(pathname);
  const templateSegments = splitPathSegments(template);

  const collected: Record<string, string> = {};
  let pathIndex = 0;

  for (let templateIndex = 0; templateIndex < templateSegments.length; templateIndex += 1) {
    const templateSegment = templateSegments[templateIndex]!;
    const targetSegment = targetSegments[pathIndex];

    if (templateSegment === "*") {
      const rest = targetSegments.slice(pathIndex).map(decodePathSegment).join("/");
      collected["splat"] = rest;
      pathIndex = targetSegments.length;
      break;
    }

    if (!templateSegment.startsWith(":")) {
      if (targetSegment === undefined || templateSegment !== targetSegment) {
        return null;
      }
      pathIndex += 1;
      continue;
    }

    const token = parseParamToken(templateSegment.slice(1));
    if (token.splat) {
      const rest = targetSegments.slice(pathIndex).map(decodePathSegment).join("/");
      if (rest.length === 0 && !token.optional) {
        return null;
      }
      if (rest.length > 0) {
        collected[token.name] = rest;
      }
      pathIndex = targetSegments.length;
      break;
    }

    if (targetSegment === undefined) {
      if (token.optional) {
        continue;
      }
      return null;
    }

    collected[token.name] = decodePathSegment(targetSegment);
    pathIndex += 1;
  }

  if (pathIndex !== targetSegments.length) {
    return null;
  }

  return {
    pathname: normalizePathname(pathname),
    params: collected as RouteParams<Path>,
  };
};

const matchTemplatePrefix = <Path extends string>(
  template: NormalizePath<Path>,
  pathname: string,
): RoutePathMatch<Path> | null => {
  const targetSegments = splitPathSegments(pathname);
  const templateSegments = splitPathSegments(template);

  if (templateSegments.length === 0) {
    return {
      pathname: "/",
      params: {} as RouteParams<Path>,
    };
  }

  const collected: Record<string, string> = {};
  let pathIndex = 0;

  for (let templateIndex = 0; templateIndex < templateSegments.length; templateIndex += 1) {
    const templateSegment = templateSegments[templateIndex]!;
    const targetSegment = targetSegments[pathIndex];

    if (templateSegment === "*") {
      const rest = targetSegments.slice(pathIndex).map(decodePathSegment).join("/");
      collected["splat"] = rest;
      pathIndex = targetSegments.length;
      break;
    }

    if (!templateSegment.startsWith(":")) {
      if (targetSegment === undefined || templateSegment !== targetSegment) {
        return null;
      }
      pathIndex += 1;
      continue;
    }

    const token = parseParamToken(templateSegment.slice(1));
    if (token.splat) {
      const rest = targetSegments.slice(pathIndex).map(decodePathSegment).join("/");
      if (rest.length === 0 && !token.optional) {
        return null;
      }
      if (rest.length > 0) {
        collected[token.name] = rest;
      }
      pathIndex = targetSegments.length;
      break;
    }

    if (targetSegment === undefined) {
      if (token.optional) {
        continue;
      }
      return null;
    }

    collected[token.name] = decodePathSegment(targetSegment);
    pathIndex += 1;
  }

  const matchedPath = pathIndex === 0 ? "/" : `/${targetSegments.slice(0, pathIndex).join("/")}`;

  return {
    pathname: matchedPath,
    params: collected as RouteParams<Path>,
  };
};

const defaultSearchAdapter = {
  parse: () => ({}),
  serialize: () => new URLSearchParams(),
} satisfies RouteSearchAdapter<Record<never, never>>;

export const defineRoute = <Path extends string, Search = Record<never, never>>(
  options: DefineRouteOptions<Path, Search>,
): RouteDefinition<Path, Search> => {
  const path = normalizePathname(options.path) as NormalizePath<Path>;
  const searchAdapter = options.search;

  const buildPath = (params: RouteParams<Path>): string => buildPathFromTemplate(path, params);

  const buildHref = (input?: BuildHrefInput<Path, Search>): string => {
    const params = (input?.params ?? ({} as RouteParams<Path>)) as RouteParams<Path>;
    const pathname = buildPath(params);
    const adapter =
      searchAdapter ?? (defaultSearchAdapter as unknown as RouteSearchAdapter<Search>);
    const searchValue = input?.search;
    if (searchValue === undefined) {
      return pathname;
    }

    const search = adapter.serialize(searchValue);
    const searchText = search.toString();
    return searchText.length > 0 ? `${pathname}?${searchText}` : pathname;
  };

  const matchPath = (pathname: string): RoutePathMatch<Path> | null =>
    matchTemplate(path, pathname);

  const matchPrefix = (pathname: string): RoutePathMatch<Path> | null =>
    matchTemplatePrefix(path, pathname);

  return {
    id: options.id,
    path,
    searchAdapter,
    ...(options.children !== undefined ? { children: options.children } : {}),
    ...(options.layout !== undefined ? { layout: options.layout } : {}),
    buildPath,
    buildHref,
    matchPath,
    matchPrefix,
  };
};

export const matchRoutePath = <Path extends string, Search>(
  route: RouteDefinition<Path, Search>,
  pathname: string,
): RoutePathMatch<Path> | null => route.matchPath(pathname);

const scoreRouteForNesting = (route: AnyRoute): number => {
  const segments = route.path === "/" ? [] : route.path.slice(1).split("/");
  return segments.reduce((score, segment) => {
    if (segment === "*") return score;
    if (segment.startsWith(":")) return score + 1;
    return score + 3;
  }, 0);
};

const remainingPathname = (fullPath: string, matchedPath: string): string => {
  if (matchedPath === "/") return fullPath;
  const rest = fullPath.slice(matchedPath.length);
  if (rest.length === 0) return "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
};

export const matchNestedRoutes = (
  routes: readonly AnyRoute[],
  pathname: string,
): readonly MatchChainEntry[] | null => {
  const sorted = [...routes].sort(
    (left, right) => scoreRouteForNesting(right) - scoreRouteForNesting(left),
  );

  for (const route of sorted) {
    if (route.layout === true) {
      if (route.children !== undefined && route.children.length > 0) {
        const childChain = matchNestedRoutes(route.children, pathname);
        if (childChain !== null) {
          const entry: MatchChainEntry = {
            route,
            params: {},
            pathname: "/",
          };
          return [entry, ...childChain];
        }
      }
      continue;
    }

    const hasChildren = route.children !== undefined && route.children.length > 0;

    if (hasChildren) {
      const prefixMatch = route.matchPrefix(pathname);
      if (prefixMatch !== null) {
        const rest = remainingPathname(pathname, prefixMatch.pathname);
        const childChain = matchNestedRoutes(route.children!, rest);
        if (childChain !== null) {
          const entry: MatchChainEntry = {
            route,
            params: prefixMatch.params as Readonly<Record<string, string>>,
            pathname: prefixMatch.pathname,
          };
          return [entry, ...childChain];
        }
      }
    }

    const exactMatch = route.matchPath(pathname);
    if (exactMatch !== null) {
      const entry: MatchChainEntry = {
        route,
        params: exactMatch.params as Readonly<Record<string, string>>,
        pathname: exactMatch.pathname,
      };
      return [entry];
    }
  }

  return null;
};
