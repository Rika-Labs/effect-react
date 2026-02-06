import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { QueryCache } from "../query/QueryCache";
import {
  asAnyRouteLoader,
  createMemoryRouterHistory,
  createRouter,
  defineRoute,
  defineRouteLoader,
} from "../router";
import { createServerHydrationScript } from "../server";
import { hydrateFrameworkState, parseFrameworkHydrationState } from "../ssr";

const waitFor = async (predicate: () => boolean, timeoutMs = 1000): Promise<void> => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("loader + ssr hydration integration", () => {
  it("round-trips loader snapshot and query cache through hydration script", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    cache.setQueryData(["profile"], { id: "u1" });

    const profileRoute = defineRoute({
      id: "profile",
      path: "/profile/:id",
    });

    const profileLoader = defineRouteLoader({
      route: profileRoute,
      run: ({ location }) => Effect.succeed({ profileId: location.params.id }),
    });

    const serverRouter = createRouter({
      routes: [profileRoute] as const,
      history: createMemoryRouterHistory("/profile/u1"),
      runtime,
      loaders: [asAnyRouteLoader(profileLoader)],
    });

    await waitFor(() => {
      const entry = serverRouter.getSnapshot().loaderState["profile"];
      return entry !== undefined && entry._tag === "success";
    });

    const script = createServerHydrationScript({
      cache,
      loaderState: serverRouter.getSnapshot().loaderState,
    });

    const serialized = script.slice(script.indexOf("=") + 1, script.lastIndexOf(";"));
    const hydration = parseFrameworkHydrationState(serialized);
    expect(hydration).toBeDefined();

    const targetCache = new QueryCache();
    const loaderState = hydrateFrameworkState({
      cache: targetCache,
      state: hydration!,
    });

    expect(targetCache.getQueryData<{ readonly id: string }>(["profile"])).toEqual({ id: "u1" });
    expect(loaderState["profile"]).toEqual({
      _tag: "success",
      value: { profileId: "u1" },
    });

    const clientRouter = createRouter({
      routes: [profileRoute] as const,
      history: createMemoryRouterHistory("/profile/u1"),
      initialLoaderState: loaderState,
    });

    expect(clientRouter.getSnapshot().loaderState["profile"]).toEqual({
      _tag: "success",
      value: { profileId: "u1" },
    });

    await clientRouter.revalidate();
    expect(clientRouter.getSnapshot().loaderState["profile"]).toEqual({
      _tag: "success",
      value: { profileId: "u1" },
    });

    await runtime.dispose();
  });
});
