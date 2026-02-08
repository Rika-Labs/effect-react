import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { discoverAppModules, effectReactVitePlugin } from "../../framework-vite";

const isStringOrNullable = (value: unknown): value is string | null | undefined =>
  typeof value === "string" || value === null || value === undefined;

const invokeResolveIdHook = async (
  plugin: ReturnType<typeof effectReactVitePlugin>,
  id: string,
): Promise<string | null | undefined> => {
  const hook = plugin.resolveId;
  if (hook === undefined) {
    throw new Error("Expected Vite resolveId hook to be defined");
  }

  if (typeof hook === "function") {
    const resolve = hook as unknown as (
      id: string,
      importer: string | undefined,
      options: unknown,
    ) => unknown;
    const value = await resolve(id, undefined, undefined);
    return isStringOrNullable(value) ? value : undefined;
  }

  const handler = hook.handler;
  const resolve = handler as unknown as (
    id: string,
    importer: string | undefined,
    options: unknown,
  ) => unknown;
  const value = await resolve(id, undefined, undefined);
  return isStringOrNullable(value) ? value : undefined;
};

const invokeLoadHook = async (
  plugin: ReturnType<typeof effectReactVitePlugin>,
  id: string,
): Promise<string | null | undefined> => {
  const hook = plugin.load;
  if (hook === undefined) {
    throw new Error("Expected Vite load hook to be defined");
  }

  if (typeof hook === "function") {
    const load = hook as unknown as (
      id: string,
      options: unknown,
    ) => unknown;
    const value = await load(id, undefined);
    return isStringOrNullable(value) ? value : undefined;
  }

  const handler = hook.handler;
  const load = handler as unknown as (
    id: string,
    options: unknown,
  ) => unknown;
  const value = await load(id, undefined);
  return isStringOrNullable(value) ? value : undefined;
};

describe("framework vite discovery", () => {
  it("discovers page/layout/action and middleware modules", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-framework-"));

    try {
      const appDir = path.join(root, "app");
      await mkdir(path.join(appDir, "users", "[id]"), {
        recursive: true,
      });
      await mkdir(path.join(appDir, "actions"), {
        recursive: true,
      });

      await writeFile(path.join(appDir, "page.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "layout.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "users", "[id]", "page.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "actions", "users.create.ts"), "export const x = 1\n");
      await writeFile(path.join(appDir, "middleware.ts"), "export default {}\n");

      const discovered = await discoverAppModules(root, "app");

      expect(discovered.pages).toEqual(
        expect.arrayContaining(["app/page.tsx", "app/users/[id]/page.tsx"]),
      );
      expect(discovered.layouts).toEqual(
        expect.arrayContaining(["app/layout.tsx"]),
      );
      expect(discovered.actions).toEqual(
        expect.arrayContaining(["app/actions/users.create.ts"]),
      );
      expect(discovered.middleware).toBe("app/middleware.ts");
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("supports custom app directories and extension filters", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-framework-"));

    try {
      const appDir = path.join(root, "src", "app");
      await mkdir(path.join(appDir, "blog"), {
        recursive: true,
      });
      await mkdir(path.join(appDir, "actions"), {
        recursive: true,
      });

      await writeFile(path.join(appDir, "page.ts"), "export default {}\n");
      await writeFile(path.join(appDir, "blog", "page.js"), "export default {}\n");
      await writeFile(path.join(appDir, "layout.jsx"), "export default {}\n");
      await writeFile(path.join(appDir, "actions", "posts.create.tsx"), "export const x = 1\n");
      await writeFile(path.join(appDir, "actions", "ignore.txt"), "ignore\n");
      await writeFile(path.join(appDir, "blog", "action.ts"), "export const ignore = true\n");

      const discovered = await discoverAppModules(root, "src/app");

      expect(discovered.pages).toEqual(
        expect.arrayContaining(["src/app/page.ts", "src/app/blog/page.js"]),
      );
      expect(discovered.layouts).toEqual(
        expect.arrayContaining(["src/app/layout.jsx"]),
      );
      expect(discovered.actions).toEqual(
        expect.arrayContaining(["src/app/actions/posts.create.tsx"]),
      );
      expect(discovered.actions).not.toContain("src/app/actions/ignore.txt");
      expect(discovered.actions).not.toContain("src/app/blog/action.ts");
      expect(discovered.middleware).toBeUndefined();
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("resolves and loads manifest virtual modules through the plugin", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-framework-"));

    try {
      const appDir = path.join(root, "src", "app");
      await mkdir(path.join(appDir, "admin"), {
        recursive: true,
      });
      await mkdir(path.join(appDir, "actions"), {
        recursive: true,
      });

      await writeFile(path.join(appDir, "page.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "admin", "page.jsx"), "export default {}\n");
      await writeFile(path.join(appDir, "layout.ts"), "export default {}\n");
      await writeFile(path.join(appDir, "actions", "users.create.ts"), "export const x = 1\n");
      await writeFile(path.join(appDir, "actions", "users.update.jsx"), "export const y = 1\n");
      await writeFile(path.join(appDir, "middleware.jsx"), "export default {}\n");

      const plugin = effectReactVitePlugin({
        appDir: "src/app",
        virtualManifestId: "virtual:effect-react/test-manifest",
      });

      const unresolved = await invokeResolveIdHook(plugin, "virtual:other");
      const unrelatedLoad = await invokeLoadHook(plugin, "\0virtual:other");
      expect(unresolved).toBeNull();
      expect(unrelatedLoad).toBeNull();

      const resolvedManifestId = await invokeResolveIdHook(
        plugin,
        "virtual:effect-react/test-manifest",
      );
      expect(resolvedManifestId).toBe("\0virtual:effect-react/test-manifest");

      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
      try {
        const loaded = await invokeLoadHook(plugin, "\0virtual:effect-react/test-manifest");
        expect(typeof loaded).toBe("string");

        if (typeof loaded !== "string") {
          throw new Error("Expected manifest module text");
        }

        expect(loaded).toContain("import { defineManifest } from '@rika-labs/effect-react/framework';");
        expect(loaded).toContain("'/src/app/page.tsx'");
        expect(loaded).toContain("'/src/app/admin/page.jsx'");
        expect(loaded).toContain("'/src/app/actions/users.create.ts'");
        expect(loaded).toContain("'/src/app/actions/users.update.jsx'");
        expect(loaded).toContain("'/src/app/layout.ts'");
        expect(loaded).toContain("import MiddlewareModule from '/src/app/middleware.jsx';");
        expect(loaded).toContain("middleware: MiddlewareModule");
      } finally {
        cwdSpy.mockRestore();
      }
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
  });

  it("uses default plugin options and omits middleware when none exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-framework-"));

    try {
      const appDir = path.join(root, "app");
      await mkdir(path.join(appDir, "actions"), {
        recursive: true,
      });

      await writeFile(path.join(appDir, "page.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "layout.tsx"), "export default {}\n");
      await writeFile(path.join(appDir, "actions", "posts.list.ts"), "export const x = 1\n");

      const plugin = effectReactVitePlugin();

      const resolvedManifestId = await invokeResolveIdHook(
        plugin,
        "virtual:effect-react/manifest",
      );
      expect(resolvedManifestId).toBe("\0virtual:effect-react/manifest");

      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
      try {
        const loaded = await invokeLoadHook(plugin, "\0virtual:effect-react/manifest");
        expect(typeof loaded).toBe("string");

        if (typeof loaded !== "string") {
          throw new Error("Expected manifest module text");
        }

        expect(loaded).toContain("'/app/page.tsx'");
        expect(loaded).toContain("'/app/layout.tsx'");
        expect(loaded).toContain("'/app/actions/posts.list.ts'");
        expect(loaded).not.toContain("MiddlewareModule");
        expect(loaded).not.toContain("middleware:");
      } finally {
        cwdSpy.mockRestore();
      }
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
  });
});
