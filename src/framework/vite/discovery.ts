import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";

export const DEFAULT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

export const VIRTUAL_ROUTES_ID = "virtual:effect-react/routes";
export const VIRTUAL_ACTIONS_ID = "virtual:effect-react/actions";

export const RESOLVED_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`;
export const RESOLVED_ACTIONS_ID = `\0${VIRTUAL_ACTIONS_ID}`;

export interface DiscoveredActionEntry {
  readonly name: string;
  readonly sourcePath: string;
}

const isRouteExtension = (filePath: string, extensions: readonly string[]): boolean =>
  extensions.some((extension) => filePath.endsWith(extension));

const toPosixPath = (value: string): string => value.replace(/\\/g, "/");

const withLeadingSlash = (value: string): string => (value.startsWith("/") ? value : `/${value}`);

const walkDirectory = (
  directory: string,
  extensions: readonly string[],
): Effect.Effect<readonly string[], never, never> =>
  Effect.gen(function* () {
    const entries = yield* Effect.tryPromise({
      try: () => readdir(directory, { withFileTypes: true }),
      catch: (cause) => cause,
    }).pipe(Effect.catchAll(() => Effect.succeed([] as const)));

    const nested = yield* Effect.forEach(entries, (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkDirectory(fullPath, extensions);
      }
      if (!isRouteExtension(fullPath, extensions)) {
        return Effect.succeed([] as readonly string[]);
      }
      return Effect.succeed([fullPath] as readonly string[]);
    });

    return nested.flat();
  });

export const discoverRouteFiles = (
  root: string,
  routesDir: string,
  extensions: readonly string[],
): Effect.Effect<readonly string[], never, never> =>
  walkDirectory(path.resolve(root, routesDir), extensions).pipe(
    Effect.map((files) =>
      files.map((filePath) => toPosixPath(path.relative(root, filePath))).sort(),
    ),
  );

const DEFINE_ACTION_NAME_REGEX =
  /defineServerAction\s*\(\s*\{[\s\S]*?name\s*:\s*["'`]([^"'`]+)["'`]/g;

export const discoverActionNames = (source: string): readonly string[] => {
  const names: string[] = [];
  for (const match of source.matchAll(DEFINE_ACTION_NAME_REGEX)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
};

export const discoverActionEntries = (
  root: string,
  actionsDir: string,
  extensions: readonly string[],
): Effect.Effect<readonly DiscoveredActionEntry[], never, never> =>
  walkDirectory(path.resolve(root, actionsDir), extensions).pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, (filePath) => {
        const sourcePath = toPosixPath(path.relative(root, filePath));
        return Effect.tryPromise({
          try: () => readFile(filePath, "utf8"),
          catch: (cause) => cause,
        }).pipe(
          Effect.catchAll(() => Effect.succeed("")),
          Effect.map((source) =>
            discoverActionNames(source).map(
              (name) =>
                ({
                  name,
                  sourcePath,
                }) satisfies DiscoveredActionEntry,
            ),
          ),
        );
      }),
    ),
    Effect.map((entries) =>
      entries
        .flat()
        .sort((left, right) =>
          left.name === right.name
            ? left.sourcePath.localeCompare(right.sourcePath)
            : left.name.localeCompare(right.name),
        ),
    ),
  );

const buildLoadersMap = (sourcePaths: readonly string[], exportName: string): string => {
  const rows = sourcePaths
    .map((sourcePath) => {
      const importPath = withLeadingSlash(sourcePath);
      return `  ${JSON.stringify(sourcePath)}: () => import(${JSON.stringify(importPath)}),`;
    })
    .join("\n");

  return `const ${exportName} = {\n${rows}\n} as const;`;
};

export const buildRoutesVirtualModule = (routeFiles: readonly string[]): string =>
  [
    `export const routeFiles = ${JSON.stringify(routeFiles)} as const;`,
    buildLoadersMap(routeFiles, "routeModules"),
    "",
    "export const loadRouteModule = (sourcePath: string) => {",
    "  const loader = routeModules[sourcePath as keyof typeof routeModules];",
    "  if (loader === undefined) {",
    "    throw new Error(`Unknown route module: ${sourcePath}`);",
    "  }",
    "  return loader();",
    "};",
    "",
  ].join("\n");

export const buildActionsVirtualModule = (entries: readonly DiscoveredActionEntry[]): string => {
  const sourcePaths = Array.from(new Set(entries.map((entry) => entry.sourcePath))).sort();

  return [
    `export const actionManifest = ${JSON.stringify(entries)} as const;`,
    buildLoadersMap(sourcePaths, "actionModules"),
    "",
    "export const loadActionModule = (sourcePath: string) => {",
    "  const loader = actionModules[sourcePath as keyof typeof actionModules];",
    "  if (loader === undefined) {",
    "    throw new Error(`Unknown action module: ${sourcePath}`);",
    "  }",
    "  return loader();",
    "};",
    "",
    "export const loadActionByName = (name: string) => {",
    "  const entry = actionManifest.find((item) => item.name === name);",
    "  if (entry === undefined) {",
    "    throw new Error(`Unknown action: ${name}`);",
    "  }",
    "  return loadActionModule(entry.sourcePath);",
    "};",
    "",
  ].join("\n");
};
