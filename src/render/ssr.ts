import { Effect } from "effect";
import type { ReactElement } from "react";
import * as ReactDOMServer from "react-dom/server";
import type { AppServices } from "../kernel/app";
import type { AppManagedRuntime } from "../kernel/runtime";
import { createHydrationScript, dehydrateAppState, type HydrationState } from "./hydration";

export interface CreateSsrHandlerOptions<E> {
  readonly runtime: AppManagedRuntime<AppServices>;
  readonly render: (request: Request) => Effect.Effect<ReactElement, E, AppServices>;
  readonly status?: number;
  readonly headers?: HeadersInit;
  readonly hydrationGlobalName?: string;
  readonly onError?: (error: E | Error) => Response;
}

const htmlResponse = (options: {
  readonly html: string;
  readonly status: number;
  readonly headers?: HeadersInit;
}): Response => {
  const headers = new Headers(options.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  return new Response(options.html, {
    status: options.status,
    headers,
  });
};

const injectScript = (html: string, script: string): string => {
  const tag = `<script>${script}</script>`;
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose === -1) {
    return `${html}${tag}`;
  }
  return `${html.slice(0, bodyClose)}${tag}${html.slice(bodyClose)}`;
};

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const createSsrHandler = <E>(options: CreateSsrHandlerOptions<E>) =>
  (request: Request): Promise<Response> => {
    const program = Effect.gen(function* () {
      const element = yield* options.render(request);
      const html = ReactDOMServer.renderToString(element);

      const state: HydrationState = yield* dehydrateAppState();
      const script = createHydrationScript(state, options.hydrationGlobalName);

      return htmlResponse({
        html: injectScript(html, script),
        status: options.status ?? 200,
        ...(options.headers !== undefined ? { headers: options.headers } : {}),
      });
    });

    return options.runtime
      .runPromise(program)
      .catch((cause: unknown) => {
        const squashed = toError(cause);
        if (options.onError !== undefined) {
          return options.onError(squashed as E | Error);
        }
        return new Response(`SSR render failed: ${squashed.message}`, {
          status: 500,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        });
      });
  };
