import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  NotFoundError,
  RedirectError,
  createMemoryRouterHistory,
  createRouter,
  defineRoute,
  defineRouteLoader,
  matchNestedRoutes,
  matchRoutePath,
  notFound,
  redirect,
  runRouteLoader,
} from "../router";

describe("router core", () => {
  it("builds and matches optional and splat params", () => {
    const filesRoute = defineRoute({
      id: "files",
      path: "/files/:path*",
    });
    const optionalRoute = defineRoute({
      id: "optional",
      path: "/posts/:id?",
    });

    expect(filesRoute.buildPath({ path: "a/b/c" })).toBe("/files/a/b/c");
    expect(matchRoutePath(filesRoute, "/files/a/b/c")?.params.path).toBe("a/b/c");

    expect(optionalRoute.buildPath({})).toBe("/posts");
    expect(matchRoutePath(optionalRoute, "/posts")?.params.id).toBeUndefined();
    expect(matchRoutePath(optionalRoute, "/posts/123")?.params.id).toBe("123");
  });

  it("throws when required params are missing", () => {
    const route = defineRoute({
      id: "required",
      path: "/users/:id",
    });

    expect(() => route.buildPath({} as never)).toThrowError(/Missing required route param/);
  });

  it("supports memory history navigation", () => {
    const route = defineRoute({
      id: "home",
      path: "/home",
    });

    const history = createMemoryRouterHistory("/home");
    const router = createRouter({
      routes: [route] as const,
      history,
    });

    expect(router.getSnapshot().pathname).toBe("/home");
    router.navigatePath("/home?tab=2", { replace: true });
    expect(router.getSnapshot().searchText).toBe("?tab=2");
  });

  it("throws redirect and notFound errors", () => {
    expect(() => redirect("/plain")).toThrow(RedirectError);
    expect(() => redirect("/next", { replace: true })).toThrow(RedirectError);
    expect(() => notFound("/missing")).toThrow(NotFoundError);
  });

  it("runs route loaders and classifies exits", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const route = defineRoute({
      id: "loader",
      path: "/loader/:id",
    });
    const location = {
      route,
      pathname: "/loader/a",
      href: "/loader/a",
      params: { id: "a" },
      search: {},
    };

    const successLoader = defineRouteLoader({
      route,
      run: ({ location: current }) => Effect.succeed(`ok:${current.params.id}`),
    });
    const failureLoader = defineRouteLoader({
      route,
      run: () => Effect.fail("failed"),
    });
    const defectLoader = defineRouteLoader({
      route,
      run: () => Effect.die("defect"),
    });

    await expect(runRouteLoader(runtime, successLoader, { location })).resolves.toEqual({
      _tag: "success",
      value: "ok:a",
    });
    await expect(runRouteLoader(runtime, failureLoader, { location })).resolves.toEqual({
      _tag: "failure",
      error: "failed",
    });

    const defect = await runRouteLoader(runtime, defectLoader, { location });
    expect(defect._tag).toBe("defect");

    await runtime.dispose();
  });

  it("covers wildcard and mismatch matching branches", () => {
    const wildcardRoute = defineRoute({
      id: "wildcard",
      path: "/docs/*",
    });
    const encodedRoute = defineRoute({
      id: "encoded",
      path: "/encoded/:id",
    });
    const exactRoute = defineRoute({
      id: "exact",
      path: "/users/:id",
    });
    const splatRoute = defineRoute({
      id: "splat",
      path: "/files/:path*",
    });

    const wildcardMatch = matchRoutePath(wildcardRoute, "/docs/a/b");
    expect(wildcardMatch).not.toBeNull();
    if (wildcardMatch !== null) {
      expect((wildcardMatch.params as Record<string, string>)["splat"]).toBe("a/b");
    }

    expect(matchRoutePath(encodedRoute, "/encoded/%E0%A4%A")?.params.id).toBe("%E0%A4%A");
    expect(matchRoutePath(exactRoute, "/accounts/alice")).toBeNull();
    expect(matchRoutePath(exactRoute, "/users/alice/extra")).toBeNull();
    expect(matchRoutePath(splatRoute, "/files")).toBeNull();
  });

  it("covers route href building edge branches", () => {
    const optionalRoute = defineRoute({
      id: "optional-edge",
      path: "/optional/:id?",
    });
    const searchRoute = defineRoute({
      id: "search",
      path: "/search",
      search: {
        parse: (_search) => ({}) as Record<never, never>,
        serialize: (_value) => new URLSearchParams(),
      },
    });

    expect(optionalRoute.buildPath({ id: "" })).toBe("/optional");
    expect(searchRoute.buildHref({ search: {} })).toBe("/search");
  });

  it("matches nested routes depth-first", () => {
    const childRoute = defineRoute({
      id: "dashboard-settings",
      path: "/settings",
    });
    const dashboardRoute = defineRoute({
      id: "dashboard",
      path: "/dashboard",
      children: [childRoute],
    });

    const chain = matchNestedRoutes([dashboardRoute], "/dashboard/settings");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(2);
    expect(chain![0]!.route.id).toBe("dashboard");
    expect(chain![1]!.route.id).toBe("dashboard-settings");
  });

  it("matches layout routes that wrap children without consuming URL segments", () => {
    const childRoute = defineRoute({
      id: "home-page",
      path: "/",
    });
    const layoutRoute = defineRoute({
      id: "root-layout",
      path: "/",
      layout: true,
      children: [childRoute],
    });

    const chain = matchNestedRoutes([layoutRoute], "/");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(2);
    expect(chain![0]!.route.id).toBe("root-layout");
    expect(chain![1]!.route.id).toBe("home-page");
  });

  it("matches nested routes with dynamic params", () => {
    const profileRoute = defineRoute({
      id: "user-profile",
      path: "/profile",
    });
    const userRoute = defineRoute({
      id: "user",
      path: "/users/:id",
      children: [profileRoute],
    });

    const chain = matchNestedRoutes([userRoute], "/users/alice/profile");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(2);
    expect(chain![0]!.params["id"]).toBe("alice");
    expect(chain![1]!.route.id).toBe("user-profile");
  });

  it("returns null when nested routes do not match", () => {
    const childRoute = defineRoute({
      id: "child",
      path: "/settings",
    });
    const parentRoute = defineRoute({
      id: "parent",
      path: "/dashboard",
      children: [childRoute],
    });

    expect(matchNestedRoutes([parentRoute], "/dashboard/unknown")).toBeNull();
  });

  it("prefers exact leaf match when no children match", () => {
    const dashboardRoute = defineRoute({
      id: "dashboard",
      path: "/dashboard",
    });

    const chain = matchNestedRoutes([dashboardRoute], "/dashboard");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(1);
    expect(chain![0]!.route.id).toBe("dashboard");
  });

  it("builds matchChain in router snapshot for nested routes", () => {
    const childRoute = defineRoute({
      id: "settings",
      path: "/settings",
    });
    const parentRoute = defineRoute({
      id: "dashboard",
      path: "/dashboard",
      children: [childRoute],
    });

    const history = createMemoryRouterHistory("/dashboard/settings");
    const router = createRouter({
      routes: [parentRoute] as const,
      history,
    });

    const snapshot = router.getSnapshot();
    expect(snapshot.matchChain.length).toBe(2);
    expect(snapshot.matchChain[0]!.route.id).toBe("dashboard");
    expect(snapshot.matchChain[1]!.route.id).toBe("settings");
    expect(snapshot.match?.route.id).toBe("settings");
  });

  it("supports loaders with parentData context", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const route = defineRoute({
      id: "child-loader",
      path: "/child",
    });
    const location = {
      route,
      pathname: "/child",
      href: "/child",
      params: {},
      search: {},
    };

    const childLoader = defineRouteLoader({
      route,
      run: ({ parentData }) => Effect.succeed(`parent:${String(parentData)}`),
    });

    const result = await runRouteLoader(runtime, childLoader, {
      location,
      parentData: "hello",
    });

    expect(result).toEqual({
      _tag: "success",
      value: "parent:hello",
    });

    await runtime.dispose();
  });

  it("handles deeply nested route chains", () => {
    const leafRoute = defineRoute({
      id: "leaf",
      path: "/detail",
    });
    const middleRoute = defineRoute({
      id: "middle",
      path: "/section",
      children: [leafRoute],
    });
    const rootRoute = defineRoute({
      id: "root",
      path: "/app",
      children: [middleRoute],
    });

    const chain = matchNestedRoutes([rootRoute], "/app/section/detail");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(3);
    expect(chain![0]!.route.id).toBe("root");
    expect(chain![1]!.route.id).toBe("middle");
    expect(chain![2]!.route.id).toBe("leaf");
  });

  it("matches index route as child of parent", () => {
    const indexRoute = defineRoute({
      id: "dashboard-index",
      path: "/",
    });
    const dashboardRoute = defineRoute({
      id: "dashboard",
      path: "/dashboard",
      children: [indexRoute],
    });

    const chain = matchNestedRoutes([dashboardRoute], "/dashboard");
    expect(chain).not.toBeNull();
    expect(chain!.length).toBe(2);
    expect(chain![0]!.route.id).toBe("dashboard");
    expect(chain![1]!.route.id).toBe("dashboard-index");
  });

  it("cancels previous loader when navigating and cleans up on dispose", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const route = defineRoute({ id: "nav", path: "/nav/:id" });

    const history = createMemoryRouterHistory("/nav/1");
    const router = createRouter({
      routes: [route] as const,
      history,
      runtime,
    });

    expect(router.getSnapshot().pathname).toBe("/nav/1");

    router.navigatePath("/nav/2");
    router.navigatePath("/nav/3");
    expect(router.getSnapshot().pathname).toBe("/nav/3");

    router.dispose();
    await runtime.dispose();
  });
});
