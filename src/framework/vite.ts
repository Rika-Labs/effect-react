import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

export interface EffectReactVitePluginOptions {
  readonly appDir?: string;
  readonly virtualManifestId?: string;
}

export interface DiscoveredAppModules {
  readonly pages: readonly string[];
  readonly layouts: readonly string[];
  readonly actions: readonly string[];
  readonly middleware?: string;
}

const normalize = (value: string): string => value.split(path.sep).join("/");

const hasSuffix = (value: string, suffixes: readonly string[]): boolean =>
  suffixes.some((suffix) => value.endsWith(suffix));

const collectFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(absolute);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
};

export const discoverAppModules = async (
  root: string,
  appDir = "app",
): Promise<DiscoveredAppModules> => {
  const absoluteAppDir = path.resolve(root, appDir);
  const files = await collectFiles(absoluteAppDir);

  const relative = files.map((file) => normalize(path.relative(root, file)));

  const pages = relative.filter((file) =>
    hasSuffix(file, ["/page.tsx", "/page.ts", "/page.jsx", "/page.js"]),
  );

  const layouts = relative.filter((file) =>
    hasSuffix(file, ["/layout.tsx", "/layout.ts", "/layout.jsx", "/layout.js"]),
  );

  const actions = relative.filter((file) =>
    file.startsWith(`${normalize(appDir)}/actions/`) &&
    hasSuffix(file, [".ts", ".tsx", ".js", ".jsx"]),
  );

  const middleware = relative.find((file) =>
    [
      `${normalize(appDir)}/middleware.ts`,
      `${normalize(appDir)}/middleware.tsx`,
      `${normalize(appDir)}/middleware.js`,
      `${normalize(appDir)}/middleware.jsx`,
    ].includes(file),
  );

  return {
    pages,
    layouts,
    actions,
    ...(middleware !== undefined ? { middleware } : {}),
  };
};

const toImportPath = (value: string): string => `/${normalize(value)}`;

const buildManifestModule = (modules: DiscoveredAppModules): string => {
  const lines: string[] = [
    "import { defineManifest } from '@effect-react/react/framework';",
  ];

  modules.pages.forEach((modulePath, index) => {
    lines.push(`import * as PageModule${String(index)} from '${toImportPath(modulePath)}';`);
  });

  modules.actions.forEach((modulePath, index) => {
    lines.push(`import * as ActionModule${String(index)} from '${toImportPath(modulePath)}';`);
  });

  modules.layouts.forEach((modulePath, index) => {
    lines.push(`import * as LayoutModule${String(index)} from '${toImportPath(modulePath)}';`);
  });

  if (modules.middleware !== undefined) {
    lines.push(`import MiddlewareModule from '${toImportPath(modules.middleware)}';`);
  }

  lines.push(
    "",
    "const pages = [",
    ...modules.pages.map((_, index) =>
      `  PageModule${String(index)}.default ?? PageModule${String(index)}.page,`,
    ),
    "];",
    "",
    "const actions = [",
    ...modules.actions.map((_, index) =>
      `  ...Object.values(ActionModule${String(index)}).filter((value) => typeof value === 'object' && value !== null && 'name' in value),`,
    ),
    "];",
    "",
    "const layouts = [",
    ...modules.layouts.map((_, index) =>
      `  LayoutModule${String(index)}.default ?? LayoutModule${String(index)}.layout,`,
    ),
    "];",
    "",
    "export default defineManifest({",
    "  pages,",
    "  actions,",
    "  layouts,",
    ...(modules.middleware !== undefined ? ["  middleware: MiddlewareModule,"] : []),
    "});",
  );

  return `${lines.join("\n")}\n`;
};

export const effectReactVitePlugin = (
  options: EffectReactVitePluginOptions = {},
): Plugin => {
  const appDir = options.appDir ?? "app";
  const virtualManifestId = options.virtualManifestId ?? "virtual:effect-react/manifest";
  const resolvedManifestId = `\0${virtualManifestId}`;

  return {
    name: "effect-react-framework",
    enforce: "pre",
    resolveId(id) {
      if (id === virtualManifestId) {
        return resolvedManifestId;
      }
      return null;
    },
    async load(id) {
      if (id !== resolvedManifestId) {
        return null;
      }

      const discovered = await discoverAppModules(process.cwd(), appDir);
      return buildManifestModule(discovered);
    },
  };
};
