import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { defineRoute, defineRouteLoader } from "../router";
import {
  loadRouteLoadersFromManifest,
  loadRoutesFromManifest,
  type RouteManifestModule,
} from "../framework";

describe("framework route registry", () => {
  it("loads route exports from manifest modules", async () => {
    const usersRoute = defineRoute({
      id: "users",
      path: "/users",
    });
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const manifest: RouteManifestModule = {
      routeFiles: ["src/routes/home.ts", "src/routes/users.ts"],
      loadRouteModule: async (sourcePath) => {
        if (sourcePath.includes("home")) {
          return { route: homeRoute };
        }
        return { usersRoute };
      },
    };

    const routes = await Effect.runPromise(loadRoutesFromManifest(manifest));
    expect(routes.map((route) => route.id)).toEqual(["home", "users"]);
  });

  it("loads and deduplicates route loaders from manifest modules", async () => {
    const usersRoute = defineRoute({
      id: "users",
      path: "/users/:id",
    });

    const loaderA = defineRouteLoader({
      route: usersRoute,
      run: ({ location }) => Effect.succeed({ source: "a", id: location.params.id }),
    });
    const loaderB = defineRouteLoader({
      route: usersRoute,
      run: ({ location }) => Effect.succeed({ source: "b", id: location.params.id }),
    });

    const manifest: RouteManifestModule = {
      routeFiles: ["src/routes/users.ts", "src/routes/users.duplicate.ts"],
      loadRouteModule: async (sourcePath) =>
        sourcePath.includes("duplicate") ? { loaderB } : { route: usersRoute, loaderA },
    };

    const loaders = await Effect.runPromise(loadRouteLoadersFromManifest(manifest));
    expect(loaders).toHaveLength(1);
    expect(loaders[0]?.route.id).toBe("users");
  });

  it("fails with typed route registry errors for bad modules", async () => {
    const missingRouteManifest: RouteManifestModule = {
      routeFiles: ["src/routes/missing.ts"],
      loadRouteModule: async () => ({ nope: true }),
    };

    const missingExit = await Effect.runPromiseExit(loadRoutesFromManifest(missingRouteManifest));
    expect(Exit.isFailure(missingExit)).toBe(true);
    if (Exit.isFailure(missingExit)) {
      const failure = Cause.squash(missingExit.cause) as { readonly _tag: string };
      expect(failure._tag).toBe("route_export_not_found");
    }

    const loadFailureManifest: RouteManifestModule = {
      routeFiles: ["src/routes/broken.ts"],
      loadRouteModule: async () => {
        throw new Error("broken");
      },
    };

    const loadFailureExit = await Effect.runPromiseExit(
      loadRoutesFromManifest(loadFailureManifest),
    );
    expect(Exit.isFailure(loadFailureExit)).toBe(true);
    if (Exit.isFailure(loadFailureExit)) {
      const failure = Cause.squash(loadFailureExit.cause) as { readonly _tag: string };
      expect(failure._tag).toBe("route_module_load_error");
    }

    const loaderLoadFailureExit = await Effect.runPromiseExit(
      loadRouteLoadersFromManifest(loadFailureManifest),
    );
    expect(Exit.isFailure(loaderLoadFailureExit)).toBe(true);
    if (Exit.isFailure(loaderLoadFailureExit)) {
      const failure = Cause.squash(loaderLoadFailureExit.cause) as { readonly _tag: string };
      expect(failure._tag).toBe("route_module_load_error");
    }
  });

  it("supports direct route and direct loader module exports", async () => {
    const profileRoute = defineRoute({
      id: "profile",
      path: "/profile",
    });
    const profileLoader = defineRouteLoader({
      route: profileRoute,
      run: () => Effect.succeed({ ok: true as const }),
    });

    const routeManifest: RouteManifestModule = {
      routeFiles: ["src/routes/profile.ts"],
      loadRouteModule: async () => profileRoute,
    };
    const routes = await Effect.runPromise(loadRoutesFromManifest(routeManifest));
    expect(routes[0]?.id).toBe("profile");

    const loaderManifest: RouteManifestModule = {
      routeFiles: ["src/routes/profile-loader.ts", "src/routes/none.ts"],
      loadRouteModule: async (sourcePath) =>
        sourcePath.includes("loader") ? profileLoader : "nope",
    };
    const loaders = await Effect.runPromise(loadRouteLoadersFromManifest(loaderManifest));
    expect(loaders).toHaveLength(1);
    expect(loaders[0]?.route.id).toBe("profile");
  });
});
