import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAppModules } from "../../framework-vite";

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
});
