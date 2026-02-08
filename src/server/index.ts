import { Effect } from "effect";
import { createElement, type ReactElement } from "react";
import type { AppServices } from "../kernel/app";
import { navigateTo } from "../navigation";
import { createSsrHandler } from "../render";
import type { AnyPageDefinition } from "../framework/contracts";
import type { EffectReactApp } from "../framework/app";

export interface CreateRequestHandlerOptions {
  readonly app: EffectReactApp;
  readonly render?: (options: {
    readonly request: Request;
    readonly page: AnyPageDefinition;
  }) => Effect.Effect<ReactElement, unknown, AppServices>;
  readonly actionPath?: string;
  readonly hydrationGlobalName?: string;
  readonly onError?: (error: Error) => Response;
}

const defaultNotFoundElement = (): ReactElement =>
  createElement("main", undefined, "Not Found");

export const createRequestHandler = (
  options: CreateRequestHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  const actionPath = options.actionPath ?? "/_actions";

  const ssrHandler = createSsrHandler({
    runtime: options.app.runtime,
    ...(options.hydrationGlobalName !== undefined
      ? { hydrationGlobalName: options.hydrationGlobalName }
      : {}),
    ...(options.onError !== undefined ? { onError: options.onError } : {}),
    render: (request) =>
      Effect.gen(function* () {
        const url = new URL(request.url);
        const href = `${url.pathname}${url.search}`;
        const page = options.app.matchPage(href);

        if (page === undefined) {
          return defaultNotFoundElement();
        }

        yield* navigateTo(href);

        if (options.render !== undefined) {
          return yield* options.render({ request, page });
        }

        return createElement(page.component);
      }).pipe(
        Effect.mapError((error) =>
          error instanceof Error ? error : new Error(String(error)),
        ),
      ),
  });

  return (request) => {
    const url = new URL(request.url);
    if (request.method.toUpperCase() === "POST" && url.pathname === actionPath) {
      return options.app.handleActionRequest(request);
    }

    return ssrHandler(request);
  };
};
