import type { ComponentType } from "react";

export type NormalizePath<Path extends string> = Path extends `/${string}` ? Path : `/${Path}`;

type TrimOptional<Token extends string> = Token extends `${infer Name}?` ? Name : Token;
type TrimSplat<Token extends string> = Token extends `${infer Name}*` ? Name : Token;
type NormalizeParamToken<Token extends string> = TrimOptional<TrimSplat<Token>>;

type ExtractParamTokens<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractParamTokens<`/${Rest}`>
  : Path extends `${string}:${infer Param}`
    ? Param
    : never;

type RequiredParamNames<Path extends string> =
  ExtractParamTokens<Path> extends infer Token
    ? Token extends string
      ? Token extends `${string}?`
        ? never
        : NormalizeParamToken<Token>
      : never
    : never;

type OptionalParamNames<Path extends string> =
  ExtractParamTokens<Path> extends infer Token
    ? Token extends string
      ? Token extends `${infer Optional}?`
        ? NormalizeParamToken<Optional>
        : never
      : never
    : never;

type RequiredRouteParams<Path extends string> = {
  readonly [K in RequiredParamNames<Path>]: string;
};

type OptionalRouteParams<Path extends string> = {
  readonly [K in OptionalParamNames<Path>]?: string;
};

export type RouteParams<Path extends string> = string extends Path
  ? Readonly<Record<string, string>>
  : [ExtractParamTokens<Path>] extends [never]
    ? Record<never, never>
    : RequiredRouteParams<Path> & OptionalRouteParams<Path>;

export interface RouteSearchAdapter<Search> {
  parse(search: URLSearchParams): Search;
  serialize(search: Search): URLSearchParams;
}

export interface RoutePathMatch<Path extends string> {
  readonly pathname: string;
  readonly params: RouteParams<Path>;
}

export interface RouteDefinition<Path extends string = string, Search = Record<never, never>> {
  readonly id: string;
  readonly path: NormalizePath<Path>;
  readonly searchAdapter: RouteSearchAdapter<Search> | undefined;
  readonly children?: readonly AnyRoute[];
  readonly layout?: boolean;
  buildPath(params: RouteParams<Path>): string;
  buildHref(input?: BuildHrefInput<Path, Search>): string;
  matchPath(pathname: string): RoutePathMatch<Path> | null;
  matchPrefix(pathname: string): RoutePathMatch<Path> | null;
}

export type AnyRoute = RouteDefinition<string, unknown>;

export type RouteParamsOf<TRoute extends AnyRoute> =
  TRoute extends RouteDefinition<infer Path, infer _Search> ? RouteParams<Path> : never;

export type RouteSearchOf<TRoute extends AnyRoute> =
  TRoute extends RouteDefinition<string, infer Search> ? Search : never;

type RequiredParamKeys<Path extends string> = keyof RequiredRouteParams<Path>;

type ParamsInput<Path extends string> = [RequiredParamKeys<Path>] extends [never]
  ? {
      readonly params?: RouteParams<Path>;
    }
  : {
      readonly params: RouteParams<Path>;
    };

export type BuildHrefInput<Path extends string, Search> = ParamsInput<Path> & {
  readonly search?: Search;
};

export type NavigateRouteOptions<TRoute extends AnyRoute> =
  TRoute extends RouteDefinition<infer Path, infer Search>
    ? BuildHrefInput<Path, Search> & {
        readonly replace?: boolean;
      }
    : never;

export interface DefineRouteOptions<Path extends string, Search> {
  readonly id: string;
  readonly path: Path;
  readonly search?: RouteSearchAdapter<Search>;
  readonly children?: readonly AnyRoute[];
  readonly layout?: boolean;
}

export interface RouteLocation<TRoute extends AnyRoute> {
  readonly route: TRoute;
  readonly pathname: string;
  readonly href: string;
  readonly params: RouteParamsOf<TRoute>;
  readonly search: RouteSearchOf<TRoute>;
}

export interface RouteContext<TRoute extends AnyRoute> {
  readonly location: RouteLocation<TRoute>;
  readonly parentData?: unknown;
}

export interface MatchChainEntry {
  readonly route: AnyRoute;
  readonly params: Readonly<Record<string, string>>;
  readonly pathname: string;
}

export interface LazyRouteModule<TRoute extends AnyRoute> {
  readonly route: TRoute;
  readonly load: () => Promise<{ readonly default: ComponentType }>;
}
