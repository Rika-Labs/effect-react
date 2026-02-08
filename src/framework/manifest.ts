import type { AnyActionDefinition } from "../actions";
import type { AnyLoaderDefinition, AnyRouteDefinition } from "../navigation";
import type {
  AnyPageDefinition,
  LayoutDefinition,
  MiddlewareDefinition,
} from "./contracts";

export interface AppManifest {
  readonly pages: readonly AnyPageDefinition[];
  readonly actions?: readonly AnyActionDefinition[];
  readonly layouts?: readonly LayoutDefinition[];
  readonly middleware?: MiddlewareDefinition;
}

export const defineManifest = (manifest: AppManifest): AppManifest => manifest;

export const routesFromManifest = (
  manifest: AppManifest,
): readonly AnyRouteDefinition[] => manifest.pages.map((page) => page.route);

export const loadersFromManifest = (
  manifest: AppManifest,
): readonly AnyLoaderDefinition[] => {
  const pageLoaders = manifest.pages
    .map((page) => page.loader)
    .filter((loader) => loader !== undefined);

  const layoutLoaders = (manifest.layouts ?? [])
    .map((layout) => layout.loader)
    .filter((loader) => loader !== undefined);

  return [...pageLoaders, ...layoutLoaders];
};
