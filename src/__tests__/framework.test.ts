import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  asAnyRouteLoader,
  createMemoryRouterHistory,
  defineRoute,
  defineRouteLoader,
} from "../router";
import { defineRouteHandler, defineServerAction } from "../server";
import { defineApp, defineAppFromManifest, defineAppFromManifests } from "../framework";

describe("framework", () => {
  it("builds an app with typed routes and server action handler", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [homeRoute] as const,
      actions: [ping] as const,
    });

    const server = app.createServerHandler();
    const response = await server(
      new Request("https://example.test/__effect/actions/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "ok" } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "ok" },
    });

    await runtime.dispose();
  });

  it("dispatches non-action requests through route handlers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const helloRoute = defineRoute({
      id: "hello",
      path: "/hello/:name",
    });

    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const helloHandler = defineRouteHandler({
      method: "GET",
      route: helloRoute,
      run: ({ params }) => Effect.succeed({ message: `Hello ${params.name}` }),
    });

    const app = defineApp({
      runtime,
      routes: [helloRoute] as const,
      actions: [ping] as const,
      handlers: [helloHandler],
    });

    const server = app.createServerHandler();
    const response = await server(
      new Request("https://example.test/hello/Rika", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Hello Rika" });

    await runtime.dispose();
  });

  it("builds app actions from virtual action manifest module", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const route = defineRoute({
      id: "home",
      path: "/",
    });

    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = await Effect.runPromise(
      defineAppFromManifest({
        runtime,
        routes: [route] as const,
        manifestModule: {
          actionManifest: [{ name: "ping", sourcePath: "src/routes/actions.ts" }] as const,
          loadActionByName: async (name) => {
            if (name === "ping") {
              return { ping };
            }
            return {};
          },
        },
      }),
    );

    expect(app.actions.map((action) => action.name)).toEqual(["ping"]);

    const server = app.createServerHandler();
    const response = await server(
      new Request("https://example.test/__effect/actions/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "ok" } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "ok" },
    });

    await runtime.dispose();
  });

  it("passes loaders into router and supports manifest route/action composition", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const profileRoute = defineRoute({
      id: "profile",
      path: "/profile/:id",
    });
    const profileLoader = defineRouteLoader({
      route: profileRoute,
      run: ({ location }) => Effect.succeed({ id: location.params.id }),
    });

    const save = defineServerAction({
      name: "profile.save",
      run: (input: { readonly id: string }) => Effect.succeed({ ok: input.id }),
    });

    const app = await Effect.runPromise(
      defineAppFromManifests({
        runtime,
        history: createMemoryRouterHistory("/profile/id"),
        actionManifestModule: {
          actionManifest: [{ name: "profile.save", sourcePath: "src/routes/profile.ts" }] as const,
          loadActionByName: async () => ({ save }),
        },
        routeManifestModule: {
          routeFiles: ["src/routes/profile.ts"] as const,
          loadRouteModule: async () => ({ route: profileRoute, profileLoader }),
        },
      }),
    );

    expect(app.routes.map((route) => route.id)).toEqual(["profile"]);
    expect(app.actions.map((action) => action.name)).toEqual(["profile.save"]);
    expect(app.loaders.map((loader) => loader.route.id)).toEqual(["profile"]);

    await app.router.revalidate();
    const loaderEntry = app.router.getSnapshot().loaderState["profile"];
    expect(loaderEntry).toEqual({
      _tag: "success",
      value: { id: "id" },
    });

    const explicitLoader = defineRouteLoader({
      route: profileRoute,
      run: () => Effect.succeed({ id: "override" }),
    });

    const appWithOverride = await Effect.runPromise(
      defineAppFromManifests({
        runtime,
        history: createMemoryRouterHistory("/profile/id"),
        actionManifestModule: {
          actionManifest: [{ name: "profile.save", sourcePath: "src/routes/profile.ts" }] as const,
          loadActionByName: async () => ({ save }),
        },
        routeManifestModule: {
          routeFiles: ["src/routes/profile.ts"] as const,
          loadRouteModule: async () => ({ route: profileRoute, profileLoader }),
        },
        loaders: [asAnyRouteLoader(explicitLoader)],
      }),
    );
    await appWithOverride.router.revalidate();
    expect(appWithOverride.router.getSnapshot().loaderState["profile"]).toEqual({
      _tag: "success",
      value: { id: "override" },
    });

    await runtime.dispose();
  });
});
