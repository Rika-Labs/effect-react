import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  asAnyRouteLoader,
  createMemoryRouterHistory,
  defineRoute,
  defineRouteLoader,
} from "../router";
import { defineServerAction } from "../server";
import { defineAppFromManifests } from "../framework";
import { discoverActionEntries, discoverRouteFiles } from "../framework/vite";

const tempRoots: string[] = [];

const createTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-discovery-"));
  tempRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("framework discovery runtime integration", () => {
  it("wires discovered route/action manifests into runtime app composition", async () => {
    const root = await createTempRoot();
    await mkdir(path.join(root, "src/routes/users"), { recursive: true });
    await mkdir(path.join(root, "src/actions"), { recursive: true });

    await writeFile(path.join(root, "src/routes/index.ts"), "export default null;\n", "utf8");
    await writeFile(path.join(root, "src/routes/users/[id].tsx"), "export default null;\n", "utf8");
    await writeFile(
      path.join(root, "src/actions/users.ts"),
      `
      const createUser = defineServerAction({
        name: "users.create",
        run: () => Effect.succeed(null),
      });
      const removeUser = defineServerAction({
        name: "users.remove",
        run: () => Effect.succeed(null),
      });
      `,
      "utf8",
    );

    const routeFiles = await Effect.runPromise(
      discoverRouteFiles(root, "src/routes", [".ts", ".tsx"]),
    );
    expect(routeFiles).toEqual(["src/routes/index.ts", "src/routes/users/[id].tsx"]);

    const actionEntries = await Effect.runPromise(
      discoverActionEntries(root, "src/actions", [".ts", ".tsx"]),
    );
    expect(actionEntries.map((entry) => entry.name)).toEqual(["users.create", "users.remove"]);

    const runtime = ManagedRuntime.make(Layer.empty);

    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });
    const usersRoute = defineRoute({
      id: "users",
      path: "/users/:id",
    });
    const usersLoader = defineRouteLoader({
      route: usersRoute,
      run: ({ location }) => Effect.succeed({ id: location.params.id }),
    });

    const createUser = defineServerAction({
      name: "users.create",
      run: (input: { readonly id: string }) => Effect.succeed({ created: input.id }),
    });
    const removeUser = defineServerAction({
      name: "users.remove",
      run: (input: { readonly id: string }) => Effect.succeed({ removed: input.id }),
    });

    const app = await Effect.runPromise(
      defineAppFromManifests({
        runtime,
        history: createMemoryRouterHistory("/users/u1"),
        actionManifestModule: {
          actionManifest: actionEntries,
          loadActionByName: async (name) => {
            if (name === "users.create" || name === "users.remove") {
              return {
                createUser,
                removeUser,
              };
            }
            return {};
          },
        },
        routeManifestModule: {
          routeFiles,
          loadRouteModule: async (sourcePath) => {
            if (sourcePath === "src/routes/index.ts") {
              return {
                route: homeRoute,
              };
            }

            if (sourcePath === "src/routes/users/[id].tsx") {
              return {
                route: usersRoute,
                usersLoader: asAnyRouteLoader(usersLoader),
              };
            }

            return {};
          },
        },
      }),
    );

    expect(app.routes.map((route) => route.id)).toEqual(["home", "users"]);
    expect(app.actions.map((action) => action.name)).toEqual(["users.create", "users.remove"]);
    expect(app.loaders.map((loader) => loader.route.id)).toEqual(["users"]);

    await app.router.revalidate();
    expect(app.router.getSnapshot().loaderState["users"]).toEqual({
      _tag: "success",
      value: { id: "u1" },
    });

    const server = app.createServerHandler();
    const response = await server(
      new Request("https://example.test/__effect/actions/users.create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { id: "u1" } }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      _tag: "success",
      value: { created: "u1" },
    });

    await runtime.dispose();
  });
});
