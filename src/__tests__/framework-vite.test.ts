import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as rootExports from "../index";
import {
  VIRTUAL_ACTIONS_ID,
  VIRTUAL_ROUTES_ID,
  buildActionsVirtualModule,
  buildRoutesVirtualModule,
  discoverActionNames,
  effectReactVitePlugin,
  transformServerActionCallsAst,
  transformServerActionCalls,
} from "../framework/vite";

const hookHandler = (hook: unknown): ((...args: readonly unknown[]) => unknown) | undefined => {
  if (hook === undefined) {
    return undefined;
  }
  if (typeof hook === "function") {
    return hook as (...args: readonly unknown[]) => unknown;
  }
  if (
    typeof hook === "object" &&
    hook !== null &&
    "handler" in hook &&
    typeof (hook as { readonly handler?: unknown }).handler === "function"
  ) {
    return (hook as { readonly handler: (...args: readonly unknown[]) => unknown }).handler;
  }
  return undefined;
};

const tempDirs: string[] = [];

const createTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-vite-"));
  tempDirs.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("framework vite plugin", () => {
  it("keeps vite plugin exports on framework/vite and out of the root entry", () => {
    expect("effectReactVitePlugin" in rootExports).toBe(false);
  });

  it("resolves virtual module ids and builds route module source", () => {
    const plugin = effectReactVitePlugin();
    const resolve = hookHandler(plugin.resolveId);
    expect(resolve?.(VIRTUAL_ROUTES_ID)).toBe("\0virtual:effect-react/routes");
    expect(resolve?.(VIRTUAL_ACTIONS_ID)).toBe("\0virtual:effect-react/actions");
    expect(resolve?.("virtual:other")).toBeNull();

    const source = buildRoutesVirtualModule(["src/routes/index.tsx"]);
    expect(source).toContain("routeFiles");
    expect(source).toContain("loadRouteModule");
    expect(source).toContain("src/routes/index.tsx");

    const actionSource = buildActionsVirtualModule([
      {
        name: "users.create",
        sourcePath: "src/routes/users.ts",
      },
    ]);
    expect(actionSource).toContain("actionManifest");
    expect(actionSource).toContain("loadActionByName");
  });

  it("extracts action names from defineServerAction declarations", () => {
    const source = `
      const one = defineServerAction({ name: "users.create", run: () => Effect.succeed(null) })
      const two = defineServerAction({
        name: "users.remove",
        run: () => Effect.succeed(null)
      })
      const dup = defineServerAction({ name: "users.create", run: () => Effect.succeed(null) })
    `;

    expect(discoverActionNames(source)).toEqual(["users.create", "users.remove"]);
    expect(discoverActionNames("const x = 1")).toEqual([]);
  });

  it("rewrites callServerAction invocations to callServerActionByName", () => {
    const input = `
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({
        name: "users.save",
        run: (input) => Effect.succeed(input)
      })
      const program = callServerAction(transport, saveUser, { id: "1" }, options)
    `;

    const output = transformServerActionCalls(input);
    expect(output).toContain("callServerActionByName");
    expect(output).toContain('"users.save"');
    expect(output).toContain("saveUser.errorCodec");

    const withoutOptions = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser, { id: "1" })
    `);
    expect(withoutOptions).toContain("undefined, saveUser.errorCodec");

    const unchanged = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, unknownAction, { id: "1" })
    `);
    expect(unchanged).not.toContain("callServerActionByName");

    const malformed = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser, { id: "1" }
    `);
    expect(malformed).toContain("callServerActionByName");

    const nonIdentifier = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, actions.saveUser, { id: "1" })
    `);
    expect(nonIdentifier).toContain("callServerAction(transport, actions.saveUser");

    const tooFewArgs = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser)
    `);
    expect(tooFewArgs).toContain("callServerAction(transport, saveUser)");

    const withExistingImport = transformServerActionCalls(`
      import { callServerAction, callServerActionByName, defineServerAction } from "../server"
      let saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser, { id: "1" })
    `);
    expect(withExistingImport).toContain("callServerActionByName");
    expect(withExistingImport.match(/callServerActionByName/g)?.length).toBe(2);

    const importWithoutCall = transformServerActionCalls(`
      import { defineServerAction } from "../server"
      var saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser, { id: "1" })
    `);
    expect(importWithoutCall).toContain("callServerActionByName(transport");
    expect(importWithoutCall).not.toContain("import { defineServerAction, callServerActionByName");

    const nestedArgs = transformServerActionCalls(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const payload = { text: "a,b", nested: [1, { q: "x,y" }] }
      const program = callServerAction(transport, saveUser, payload, { signal: options?.signal })
    `);
    expect(nestedArgs).toContain('"users.save"');
    expect(nestedArgs).toContain("payload");

    const aliasImport = transformServerActionCallsAst(`
      import { callServerAction as csa, defineServerAction, callServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const a = csa(transport, saveUser, { id: "1" })
      const b = callServerAction(transport, saveUser, { id: "2" })
    `);
    expect(aliasImport).toContain("const a = csa(");
    expect(aliasImport).toContain('callServerActionByName(transport, "users.save", { id: "2" }');

    const typedCall = transformServerActionCallsAst(`
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const a = callServerAction<Result>(transport, saveUser, { id: "2" })
    `);
    expect(typedCall).toContain('callServerActionByName(transport, "users.save", { id: "2" }');
  });

  it("loads discovered route files and action manifest", async () => {
    const root = await createTempRoot();
    await mkdir(path.join(root, "src/routes/posts"), { recursive: true });
    await writeFile(path.join(root, "src/routes/index.tsx"), "export default null\n", "utf8");
    await writeFile(path.join(root, "src/routes/posts/[id].ts"), "export default null\n", "utf8");
    await writeFile(path.join(root, "src/routes/posts/readme.md"), "ignore\n", "utf8");
    await writeFile(
      path.join(root, "src/routes/posts/actions.ts"),
      `
      import { Effect } from "effect"
      import { defineServerAction } from "@effect-react/react/server"
      export const savePost = defineServerAction({
        name: "posts.save",
        run: () => Effect.succeed({ ok: true as const })
      })
      `,
      "utf8",
    );
    await writeFile(
      path.join(root, "src/routes/posts/actions-2.ts"),
      `
      import { Effect } from "effect"
      import { defineServerAction } from "@effect-react/react/server"
      export const savePostAgain = defineServerAction({
        name: "posts.save",
        run: () => Effect.succeed({ ok: true as const })
      })
      export const removePost = defineServerAction({
        name: "posts.remove",
        run: () => Effect.succeed({ ok: true as const })
      })
      `,
      "utf8",
    );

    const plugin = effectReactVitePlugin();
    const load = hookHandler(plugin.load);
    const context = {
      environment: {
        config: {
          root,
        },
      },
    };

    const routesSource = await load?.call(context, "\0virtual:effect-react/routes");
    expect(routesSource).toContain("src/routes/index.tsx");
    expect(routesSource).toContain("src/routes/posts/[id].ts");
    expect(routesSource).not.toContain("readme.md");

    const actionsSource = await load?.call(context, "\0virtual:effect-react/actions");
    expect(actionsSource).toContain("actionManifest");
    expect(actionsSource).toContain("posts.save");
    expect(actionsSource).toContain("posts.remove");
    expect(actionsSource).toContain("src/routes/posts/actions.ts");
    expect(actionsSource).toContain("src/routes/posts/actions-2.ts");
  });

  it("returns empty route manifest when routes directory is missing", async () => {
    const root = await createTempRoot();
    const plugin = effectReactVitePlugin({ routesDir: "app/routes" });
    const load = hookHandler(plugin.load);
    const context = {
      environment: {
        config: {
          root,
        },
      },
    };

    const routesSource = await load?.call(context, "\0virtual:effect-react/routes");
    expect(routesSource).toContain("routeFiles = []");
  });

  it("returns null for unrelated load ids and transform fallbacks", async () => {
    const plugin = effectReactVitePlugin();
    const load = hookHandler(plugin.load);
    const transform = hookHandler(plugin.transform);

    const context = {
      environment: {
        config: {
          root: "/tmp",
        },
      },
    };

    await expect(load?.call(context, "\0virtual:other")).resolves.toBeNull();
    expect(transform?.call(context, "const x = 1", "src/file.css")).toBeNull();
    expect(
      transform?.call(
        context,
        'import { callServerAction } from "../server"; const x = callServerAction(t, a, i)',
        "src/file.ts",
      ),
    ).toBeNull();

    const transformed = transform?.call(
      context,
      `
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, saveUser, { id: "1" })
      `,
      "src/file.ts",
    );
    const transformedResult = transformed as {
      readonly map?: { readonly sources?: readonly string[] };
    } | null;
    expect(transformedResult).not.toBeNull();
    expect(transformedResult?.map).not.toBeNull();
    expect(
      (transformedResult?.map?.sources ?? []).some((source) => source.endsWith("file.ts")),
    ).toBe(true);

    const unchanged = transform?.call(
      context,
      `
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({ name: "users.save", run: () => Effect.succeed(null) })
      const program = callServerAction(transport, unknownAction, { id: "1" })
      `,
      "src/file.ts",
    );
    expect(unchanged).toBeNull();
  });

  it("returns empty action manifest when actions directory is missing", async () => {
    const root = await createTempRoot();
    const plugin = effectReactVitePlugin({ actionsDir: "app/actions" });
    const load = hookHandler(plugin.load);
    const context = {
      environment: {
        config: {
          root,
        },
      },
    };

    const actionsSource = await load?.call(context, "\0virtual:effect-react/actions");
    expect(actionsSource).toContain("actionManifest = []");
  });
});
