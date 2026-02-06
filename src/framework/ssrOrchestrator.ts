import { Cause, Effect } from "effect";
import type { ReactElement } from "react";
import type { EffectRuntime } from "../internal/runtimeContext";
import { QueryCache } from "../query/QueryCache";
import { matchNestedRoutes, type AnyRoute, type MatchChainEntry } from "../router";
import {
  runRouteLoaderChainEffect,
  type AnyRouteLoader,
  type RouteLoaderSnapshot,
} from "../router/loader";
import { createFrameworkHydrationScript, dehydrateFrameworkState } from "../ssr/dehydrate";
import {
  ServerRenderDefectError,
  ServerRenderFailureError,
  renderEffectToReadableStreamEffect,
  renderEffectToStringEffect,
} from "../server/ssr";

const CONTENT_TYPE_HTML = "text/html; charset=utf-8";

const hasNestedRoutes = (routes: readonly AnyRoute[]): boolean =>
  routes.some(
    (route) => (route.children !== undefined && route.children.length > 0) || route.layout === true,
  );

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

const resolveFlatRouteMatch = (
  routes: readonly AnyRoute[],
  pathname: string,
): readonly MatchChainEntry[] => {
  const sortedRoutes = [...routes].sort((left, right) => scoreRoute(right) - scoreRoute(left));
  for (const route of sortedRoutes) {
    const matched = route.matchPath(pathname);
    if (matched !== null) {
      return [
        {
          route,
          params: matched.params as Readonly<Record<string, string>>,
          pathname: matched.pathname,
        },
      ];
    }
  }
  return [];
};

const resolveMatchChain = (
  routes: readonly AnyRoute[],
  pathname: string,
): readonly MatchChainEntry[] => {
  if (hasNestedRoutes(routes)) {
    const nested = matchNestedRoutes(routes, pathname);
    if (nested !== null) {
      return nested;
    }
  }
  return resolveFlatRouteMatch(routes, pathname);
};

const encodeDefect = (cause: unknown): string => {
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return "Unknown defect";
  }
};

const createInlineScriptTag = (source: string): string => `<script>${source}</script>`;

const injectHydrationScriptIntoHtml = (html: string, script: string): string => {
  const scriptTag = createInlineScriptTag(script);
  const index = html.lastIndexOf("</body>");
  if (index === -1) {
    return `${html}${scriptTag}`;
  }
  return `${html.slice(0, index)}${scriptTag}${html.slice(index)}`;
};

const normalizeStreamChunk = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array();
};

const appendHydrationScriptToStream = (
  source: ReadableStream<unknown>,
  hydrationScript: string,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const scriptTag = createInlineScriptTag(hydrationScript);
  const closingBodyTag = "</body>";
  const tailLength = closingBodyTag.length - 1;
  let buffer = "";
  let injected = false;
  const reader = source.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        if (injected) {
          if (buffer.length > 0) {
            controller.enqueue(encoder.encode(buffer));
          }
        } else {
          controller.enqueue(encoder.encode(buffer + scriptTag));
        }
        controller.close();
        return;
      }

      const text =
        typeof value === "string"
          ? value
          : decoder.decode(normalizeStreamChunk(value), { stream: true });
      const combined = buffer + text;

      if (injected) {
        if (combined.length > 0) {
          controller.enqueue(encoder.encode(combined));
        }
        buffer = "";
        return;
      }

      const index = combined.lastIndexOf(closingBodyTag);
      if (index !== -1) {
        const before = combined.slice(0, index);
        const after = combined.slice(index);
        controller.enqueue(encoder.encode(before + scriptTag + after));
        injected = true;
        buffer = "";
        return;
      }

      if (combined.length > tailLength) {
        const emit = combined.slice(0, combined.length - tailLength);
        if (emit.length > 0) {
          controller.enqueue(encoder.encode(emit));
        }
        buffer = combined.slice(combined.length - tailLength);
      } else {
        buffer = combined;
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
};

const resolveHtmlHeaders = (headers?: HeadersInit): Headers => {
  const resolved = new Headers(headers);
  if (!resolved.has("content-type")) {
    resolved.set("content-type", CONTENT_TYPE_HTML);
  }
  return resolved;
};

const toErrorResponsePayload = <E>(error: FrameworkSsrOrchestratorError<E>): unknown => {
  if (error._tag === "render_failure") {
    const value = error.error;
    if (value instanceof Error) {
      return {
        _tag: "render_failure" as const,
        error: {
          name: value.name,
          message: value.message,
        },
      };
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return {
        _tag: "render_failure" as const,
        error: value,
      };
    }
    return {
      _tag: "render_failure" as const,
      error: "Non-serializable render error",
    };
  }

  return {
    _tag: error._tag,
    message: error.message,
  };
};

const defaultErrorResponse = <E>(error: FrameworkSsrOrchestratorError<E>): Response =>
  new Response(JSON.stringify(toErrorResponsePayload(error)), {
    status: 500,
    headers: {
      "content-type": "application/json",
    },
  });

const toRenderError = <E>(cause: unknown): FrameworkSsrOrchestratorError<E> => {
  if (cause instanceof ServerRenderFailureError) {
    return {
      _tag: "render_failure",
      error: cause.error as E,
    };
  }
  if (cause instanceof ServerRenderDefectError) {
    return {
      _tag: "render_defect",
      message: cause.message,
    };
  }
  return {
    _tag: "render_defect",
    message: encodeDefect(cause),
  };
};

export type FrameworkSsrRenderMode = "string" | "stream";

export interface FrameworkSsrRenderContext {
  readonly request: Request;
  readonly pathname: string;
  readonly searchText: string;
  readonly matchChain: readonly MatchChainEntry[];
  readonly loaderState: RouteLoaderSnapshot;
  readonly cache: QueryCache;
}

export type FrameworkSsrOrchestratorError<E> =
  | {
      readonly _tag: "loader_defect";
      readonly message: string;
    }
  | {
      readonly _tag: "render_failure";
      readonly error: E;
    }
  | {
      readonly _tag: "render_defect";
      readonly message: string;
    };

export interface FrameworkSsrOrchestratorSuccess {
  readonly request: Request;
  readonly pathname: string;
  readonly searchText: string;
  readonly matchChain: readonly MatchChainEntry[];
  readonly loaderState: RouteLoaderSnapshot;
  readonly cache: QueryCache;
  readonly hydrationScript: string;
  readonly html: string;
}

export interface FrameworkSsrOrchestratorOptions<E> {
  readonly runtime: EffectRuntime;
  readonly request: Request;
  readonly routes: readonly AnyRoute[];
  readonly loaders?: readonly AnyRouteLoader[];
  readonly cache?: QueryCache;
  readonly mode?: FrameworkSsrRenderMode;
  readonly globalName?: string;
  readonly render: (context: FrameworkSsrRenderContext) => Effect.Effect<ReactElement, E, never>;
}

const runLoaderChain = (
  runtime: EffectRuntime,
  request: Request,
  chain: readonly MatchChainEntry[],
  loaders: readonly AnyRouteLoader[],
  pathname: string,
  searchText: string,
): Effect.Effect<
  RouteLoaderSnapshot,
  { readonly _tag: "loader_defect"; readonly message: string },
  never
> => {
  if (chain.length === 0 || loaders.length === 0) {
    return Effect.succeed({});
  }

  return runRouteLoaderChainEffect({
    runtime,
    chain,
    loaders,
    pathname,
    searchText,
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
  }).pipe(
    Effect.catchAllCause((cause) =>
      Effect.fail({
        _tag: "loader_defect" as const,
        message: encodeDefect(Cause.pretty(cause)),
      }),
    ),
  );
};

export const runFrameworkSsrOrchestrator = <E>(
  options: FrameworkSsrOrchestratorOptions<E>,
): Effect.Effect<FrameworkSsrOrchestratorSuccess, FrameworkSsrOrchestratorError<E>, never> =>
  Effect.gen(function* () {
    const url = new URL(options.request.url);
    const pathname = url.pathname;
    const searchText = url.search;
    const matchChain = resolveMatchChain(options.routes, pathname);
    const cache = options.cache ?? new QueryCache();
    const loaders = options.loaders ?? [];

    const loaderState = yield* runLoaderChain(
      options.runtime,
      options.request,
      matchChain,
      loaders,
      pathname,
      searchText,
    );

    const context: FrameworkSsrRenderContext = {
      request: options.request,
      pathname,
      searchText,
      matchChain,
      loaderState,
      cache,
    };

    const renderOptions =
      options.request.signal === undefined ? undefined : { signal: options.request.signal };
    const html = yield* renderEffectToStringEffect(
      options.runtime,
      options.render(context),
      renderOptions,
    ).pipe(Effect.mapError((error) => toRenderError<E>(error)));
    const hydrationScript = createFrameworkHydrationScript(
      dehydrateFrameworkState({
        cache,
        loaderState,
      }),
      options.globalName,
    );

    return {
      request: options.request,
      pathname,
      searchText,
      matchChain,
      loaderState,
      cache,
      hydrationScript,
      html,
    };
  });

export interface CreateFrameworkSsrResponseOptions<E> extends FrameworkSsrOrchestratorOptions<E> {
  readonly status?: number;
  readonly headers?: HeadersInit;
}

export const createFrameworkSsrResponseEffect = <E>(
  options: CreateFrameworkSsrResponseOptions<E>,
): Effect.Effect<Response, FrameworkSsrOrchestratorError<E>, never> =>
  options.mode === "stream"
    ? Effect.gen(function* () {
        const url = new URL(options.request.url);
        const pathname = url.pathname;
        const searchText = url.search;
        const matchChain = resolveMatchChain(options.routes, pathname);
        const cache = options.cache ?? new QueryCache();
        const loaders = options.loaders ?? [];

        const loaderState = yield* runLoaderChain(
          options.runtime,
          options.request,
          matchChain,
          loaders,
          pathname,
          searchText,
        );

        const context: FrameworkSsrRenderContext = {
          request: options.request,
          pathname,
          searchText,
          matchChain,
          loaderState,
          cache,
        };

        const renderOptions =
          options.request.signal === undefined ? undefined : { signal: options.request.signal };
        const stream = yield* renderEffectToReadableStreamEffect(
          options.runtime,
          options.render(context),
          renderOptions,
        ).pipe(Effect.mapError((error) => toRenderError<E>(error)));

        const hydrationScript = createFrameworkHydrationScript(
          dehydrateFrameworkState({
            cache,
            loaderState,
          }),
          options.globalName,
        );
        const headers = resolveHtmlHeaders(options.headers);
        const body = appendHydrationScriptToStream(stream, hydrationScript);
        return new Response(body, {
          status: options.status ?? 200,
          headers,
        });
      })
    : runFrameworkSsrOrchestrator(options).pipe(
        Effect.map((result) => {
          const headers = resolveHtmlHeaders(options.headers);
          return new Response(injectHydrationScriptIntoHtml(result.html, result.hydrationScript), {
            status: options.status ?? 200,
            headers,
          });
        }),
      );

export interface CreateFrameworkSsrRequestHandlerOptions<E> extends Omit<
  CreateFrameworkSsrResponseOptions<E>,
  "request" | "cache"
> {
  readonly cache?: QueryCache | (() => QueryCache);
  readonly onError?: (error: FrameworkSsrOrchestratorError<E>) => Response;
}

const resolveCache = (
  cache: QueryCache | (() => QueryCache) | undefined,
): QueryCache | undefined => {
  if (typeof cache === "function") {
    return cache();
  }
  return cache;
};

export const createFrameworkSsrRequestHandler = <E>(
  options: CreateFrameworkSsrRequestHandlerOptions<E>,
): ((request: Request) => Promise<Response>) => {
  const onError = options.onError ?? defaultErrorResponse;

  return (request) => {
    const cache = resolveCache(options.cache);
    return Effect.runPromise(
      createFrameworkSsrResponseEffect({
        runtime: options.runtime,
        request,
        routes: options.routes,
        ...(options.loaders !== undefined ? { loaders: options.loaders } : {}),
        ...(cache !== undefined ? { cache } : {}),
        ...(options.mode !== undefined ? { mode: options.mode } : {}),
        ...(options.globalName !== undefined ? { globalName: options.globalName } : {}),
        ...(options.status !== undefined ? { status: options.status } : {}),
        ...(options.headers !== undefined ? { headers: options.headers } : {}),
        render: options.render,
      }).pipe(Effect.catchAll((error) => Effect.succeed(onError(error)))),
    );
  };
};
