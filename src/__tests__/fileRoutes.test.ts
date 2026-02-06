import { describe, expect, it } from "vitest";
import {
  createFileRouteManifest,
  createNestedFileRouteTree,
  defineFileRoute,
  filePathToRoutePath,
} from "../framework";

describe("file route adapter", () => {
  it("converts common file-route patterns to route paths", () => {
    expect(filePathToRoutePath("src/routes/index.tsx")).toBe("/");
    expect(filePathToRoutePath("src/routes/users/[id].tsx")).toBe("/users/:id");
    expect(filePathToRoutePath("src/routes/blog/[...slug].tsx")).toBe("/blog/:slug*");
  });

  it("builds typed route definitions from file paths", () => {
    const route = defineFileRoute({
      id: "users.detail",
      filePath: "src/routes/users/[id].tsx",
    });

    expect(route.route.path).toBe("/users/:id");
    expect(route.route.buildPath({ id: "alice" })).toBe("/users/alice");
  });

  it("supports optional catch-all routes and paths outside a routes directory", () => {
    expect(filePathToRoutePath("src/routes/docs/[[...slug]].tsx")).toBe("/docs/:slug*");
    expect(filePathToRoutePath("app/users/[id].tsx")).toBe("/app/users/:id");
  });

  it("sorts file-route manifests by route path", () => {
    const usersRoute = defineFileRoute({
      id: "users",
      filePath: "src/routes/users/[id].tsx",
    });
    const homeRoute = defineFileRoute({
      id: "home",
      filePath: "src/routes/index.tsx",
    });

    const manifest = createFileRouteManifest({
      users: usersRoute,
      home: homeRoute,
    });

    expect(manifest.map((entry) => entry.id)).toEqual(["home", "users"]);
  });

  it("strips route groups from file paths", () => {
    expect(filePathToRoutePath("src/routes/(auth)/login.tsx")).toBe("/login");
    expect(filePathToRoutePath("src/routes/(marketing)/about.tsx")).toBe("/about");
  });

  it("builds nested tree from flat file paths with layouts", () => {
    const tree = createNestedFileRouteTree([
      "src/routes/dashboard/_layout.tsx",
      "src/routes/dashboard/settings.tsx",
      "src/routes/dashboard/index.tsx",
    ]);

    expect(tree.length).toBe(1);
    const dashboard = tree[0]!;
    expect(dashboard.route.layout).toBe(true);
    expect(dashboard.children.length).toBe(2);
  });

  it("builds nested tree with route groups", () => {
    const tree = createNestedFileRouteTree([
      "src/routes/(auth)/login.tsx",
      "src/routes/(auth)/register.tsx",
    ]);

    expect(tree.length).toBe(1);
    const group = tree[0]!;
    expect(group.children.length).toBe(2);
    const childIds = group.children.map((c) => c.route.path);
    expect(childIds).toContain("/login");
    expect(childIds).toContain("/register");
  });

  it("generates proper route tree from complex filesystem", () => {
    const tree = createNestedFileRouteTree([
      "src/routes/index.tsx",
      "src/routes/about.tsx",
      "src/routes/dashboard/_layout.tsx",
      "src/routes/dashboard/index.tsx",
      "src/routes/dashboard/settings.tsx",
    ]);

    expect(tree.length).toBe(3);
    const dashboardNode = tree.find((n) => n.route.id.includes("layout"));
    expect(dashboardNode).toBeTruthy();
    expect(dashboardNode!.children.length).toBe(2);
  });

  it("returns empty tree for empty input", () => {
    const tree = createNestedFileRouteTree([]);
    expect(tree).toEqual([]);
  });
});
