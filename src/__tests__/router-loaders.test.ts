import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  asAnyRouteLoader,
  createPendingRouteLoaderSnapshot,
  createMemoryRouterHistory,
  createRouter,
  defineRoute,
  defineRouteLoader,
  runRouteLoaderChain,
} from "../router";

const waitForCondition = async (predicate: () => boolean, timeoutMs = 1000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("router loader lifecycle", () => {
  it("executes nested loaders and passes parentData", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const childRoute = defineRoute({
      id: "child",
      path: "/settings",
    });
    const parentRoute = defineRoute({
      id: "parent",
      path: "/dashboard",
      children: [childRoute],
    });

    const parentLoader = defineRouteLoader({
      route: parentRoute,
      run: () => Effect.succeed({ token: "p" }),
    });
    const childLoader = defineRouteLoader({
      route: childRoute,
      run: ({ parentData }) =>
        Effect.succeed({
          fromParent: (parentData as { readonly token: string }).token,
        }),
    });

    const router = createRouter({
      routes: [parentRoute] as const,
      history: createMemoryRouterHistory("/dashboard/settings"),
      runtime,
      loaders: [asAnyRouteLoader(parentLoader), asAnyRouteLoader(childLoader)],
    });

    await waitForCondition(() => {
      const child = router.getSnapshot().loaderState["child"];
      return child !== undefined && child._tag === "success";
    });

    const snapshot = router.getSnapshot();
    expect(snapshot.loadersPending).toBe(false);
    expect(snapshot.loaderState["parent"]).toEqual({
      _tag: "success",
      value: { token: "p" },
    });
    expect(snapshot.loaderState["child"]).toEqual({
      _tag: "success",
      value: { fromParent: "p" },
    });

    await runtime.dispose();
  });

  it("reruns loaders on navigation and supports explicit revalidation", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const userRoute = defineRoute({
      id: "user",
      path: "/users/:id",
    });

    const loader = defineRouteLoader({
      route: userRoute,
      run: ({ location }) => Effect.succeed({ id: location.params["id"] }),
    });

    const router = createRouter({
      routes: [userRoute] as const,
      history: createMemoryRouterHistory("/users/a"),
      runtime,
      loaders: [asAnyRouteLoader(loader)],
    });

    await waitForCondition(() => {
      const current = router.getSnapshot().loaderState["user"];
      return current !== undefined && current._tag === "success";
    });
    expect(router.getSnapshot().loaderState["user"]).toEqual({
      _tag: "success",
      value: { id: "a" },
    });

    router.navigatePath("/users/b");
    await waitForCondition(() => {
      const current = router.getSnapshot().loaderState["user"];
      return current !== undefined && current._tag === "success";
    });
    expect(router.getSnapshot().loaderState["user"]).toEqual({
      _tag: "success",
      value: { id: "b" },
    });

    await router.revalidate();
    expect(router.getSnapshot().loaderState["user"]).toEqual({
      _tag: "success",
      value: { id: "b" },
    });

    await runtime.dispose();
  });

  it("classifies missing/failure/defect branches in loader chain", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const parentRoute = defineRoute({
      id: "parent",
      path: "/parent",
    });
    const childRoute = defineRoute({
      id: "child",
      path: "/child",
    });

    const chain = [
      { route: parentRoute, params: {}, pathname: "/parent" },
      { route: childRoute, params: {}, pathname: "/child" },
    ] as const;

    const childLoader = defineRouteLoader({
      route: childRoute,
      run: () => Effect.succeed("ok"),
    });
    const pending = createPendingRouteLoaderSnapshot(chain, [asAnyRouteLoader(childLoader)]);
    expect(pending).toEqual({
      child: { _tag: "pending" },
    });

    const missingParentResult = await runRouteLoaderChain({
      runtime,
      chain,
      loaders: [asAnyRouteLoader(childLoader)],
      pathname: "/parent/child",
      searchText: "",
    });
    expect(missingParentResult["child"]).toEqual({ _tag: "success", value: "ok" });

    const failLoader = defineRouteLoader({
      route: parentRoute,
      run: () => Effect.fail("nope"),
    });
    const failResult = await runRouteLoaderChain({
      runtime,
      chain,
      loaders: [asAnyRouteLoader(failLoader), asAnyRouteLoader(childLoader)],
      pathname: "/parent/child",
      searchText: "",
    });
    expect(failResult["parent"]).toEqual({ _tag: "failure", error: "nope" });
    expect(failResult["child"]).toEqual({ _tag: "pending" });

    const defectLoader = defineRouteLoader({
      route: parentRoute,
      run: () => Effect.die("boom"),
    });
    const defectResult = await runRouteLoaderChain({
      runtime,
      chain,
      loaders: [asAnyRouteLoader(defectLoader), asAnyRouteLoader(childLoader)],
      pathname: "/parent/child",
      searchText: "",
    });
    expect(defectResult["parent"]?._tag).toBe("defect");

    await runtime.dispose();
  });
});
