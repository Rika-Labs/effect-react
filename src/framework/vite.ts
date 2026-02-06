import { Effect } from "effect";
import type { Plugin } from "vite";
import {
  DEFAULT_EXTENSIONS,
  RESOLVED_ACTIONS_ID,
  RESOLVED_ROUTES_ID,
  VIRTUAL_ACTIONS_ID,
  VIRTUAL_ROUTES_ID,
  buildActionsVirtualModule,
  buildRoutesVirtualModule,
  discoverActionEntries,
  discoverActionNames,
  discoverRouteFiles,
  type DiscoveredActionEntry,
} from "./vite/discovery";
import { transformServerActionCalls } from "./vite/transform";
import {
  transformServerActionCallsAst,
  transformServerActionCallsAstWithMap,
} from "./vite/astTransform";

export {
  VIRTUAL_ACTIONS_ID,
  VIRTUAL_ROUTES_ID,
  buildActionsVirtualModule,
  buildRoutesVirtualModule,
  discoverActionEntries,
  discoverActionNames,
  discoverRouteFiles,
  transformServerActionCallsAst,
  transformServerActionCalls,
};

export type { DiscoveredActionEntry };

export interface EffectReactVitePluginOptions {
  readonly routesDir?: string;
  readonly actionsDir?: string;
  readonly routeExtensions?: readonly string[];
}

export const effectReactVitePlugin = (options: EffectReactVitePluginOptions = {}): Plugin => {
  const routesDir = options.routesDir ?? "src/routes";
  const actionsDir = options.actionsDir ?? "src";
  const extensions = options.routeExtensions ?? DEFAULT_EXTENSIONS;

  return {
    name: "effect-react-framework",
    resolveId: (id) => {
      if (id === VIRTUAL_ROUTES_ID) {
        return RESOLVED_ROUTES_ID;
      }
      if (id === VIRTUAL_ACTIONS_ID) {
        return RESOLVED_ACTIONS_ID;
      }
      return null;
    },
    load: async function loadVirtualModule(id) {
      if (id === RESOLVED_ROUTES_ID) {
        const root = this.environment.config.root;
        const routeFiles = await Effect.runPromise(discoverRouteFiles(root, routesDir, extensions));
        return buildRoutesVirtualModule(routeFiles);
      }
      if (id === RESOLVED_ACTIONS_ID) {
        const root = this.environment.config.root;
        const entries = await Effect.runPromise(
          discoverActionEntries(root, actionsDir, extensions),
        );
        return buildActionsVirtualModule(entries);
      }
      return null;
    },
    transform(code, id) {
      if (
        !id.endsWith(".ts") &&
        !id.endsWith(".tsx") &&
        !id.endsWith(".js") &&
        !id.endsWith(".jsx")
      ) {
        return null;
      }

      if (!code.includes("defineServerAction(") || !code.includes("callServerAction(")) {
        return null;
      }

      const transformed = transformServerActionCallsAstWithMap(code, id);
      if (transformed === null) {
        return null;
      }

      return {
        code: transformed.code,
        map: transformed.map,
      };
    },
  } satisfies Plugin;
};
