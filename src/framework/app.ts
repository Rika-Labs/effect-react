import { createActionHttpHandler, type AnyActionDefinition } from "../actions";
import { createAppRuntime, type AppServices } from "../kernel/app";
import type { AppManagedRuntime } from "../kernel/runtime";
import { matchRoute, parseHref } from "../navigation/matcher";
import {
  loadersFromManifest,
  routesFromManifest,
  type AppManifest,
} from "./manifest";
import { resolveConfig, type EffectReactConfig, type EffectReactResolvedConfig } from "../config";
import type { AnyPageDefinition } from "./contracts";

export interface CreateAppOptions {
  readonly manifest: AppManifest;
  readonly config?: EffectReactConfig;
  readonly initialHref?: string;
}

export interface EffectReactApp {
  readonly manifest: AppManifest;
  readonly config: EffectReactResolvedConfig;
  readonly runtime: AppManagedRuntime<AppServices>;
  readonly actions: readonly AnyActionDefinition[];
  readonly matchPage: (href: string) => AnyPageDefinition | undefined;
  readonly handleActionRequest: (request: Request) => Promise<Response>;
  readonly dispose: () => Promise<void>;
}

const createPageMatcher = (pages: readonly AnyPageDefinition[]) => {
  const routes = pages.map((page) => page.route);

  return (href: string): AnyPageDefinition | undefined => {
    const parsed = parseHref(href);
    const matched = matchRoute({
      routes,
      pathname: parsed.pathname,
      search: {},
    });

    if (matched === null) {
      return undefined;
    }

    return pages.find((page) => page.route.id === matched.route.id);
  };
};

export const createApp = (options: CreateAppOptions): EffectReactApp => {
  const manifest = options.manifest;
  const routes = routesFromManifest(manifest);
  const loaders = loadersFromManifest(manifest);
  const actions = manifest.actions ?? [];

  const runtime = createAppRuntime({
    routes,
    actions,
    loaders,
    ...(options.initialHref !== undefined ? { initialHref: options.initialHref } : {}),
  });

  const actionHandlerFactory = createActionHttpHandler();
  const handleActionRequest = actionHandlerFactory((effect) => runtime.runPromise(effect));

  return {
    manifest,
    config: resolveConfig(options.config),
    runtime,
    actions,
    matchPage: createPageMatcher(manifest.pages),
    handleActionRequest,
    dispose: () => runtime.dispose(),
  };
};
