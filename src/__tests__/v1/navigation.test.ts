import { Cause, Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import {
  defineLoader,
  defineRoute,
  navigateTo,
  Navigation,
  NavigationCancelledError,
  NavigationRuntimeError,
} from "../../navigation";

describe("navigation service", () => {
  it("navigates with dependency-aware loaders", async () => {
    const userRoute = defineRoute({
      id: "users.show",
      path: "/users/:id",
      search: Schema.Struct({ tab: Schema.String }),
    });

    const loadUser = defineLoader({
      name: "load-user",
      routeId: userRoute.id,
      run: ({ params }) => Effect.succeed({ id: params["id"] }),
    });

    const loadView = defineLoader({
      name: "load-view",
      routeId: userRoute.id,
      dependsOn: ["load-user"] as const,
      run: ({ search, dependencyResults }) =>
        Effect.succeed({
          tab: (search as { readonly tab: string }).tab,
          user: dependencyResults["load-user"],
        }),
    });

    const runtime = createAppRuntime({
      routes: [userRoute] as const,
      loaders: [loadUser, loadView] as const,
    });

    const snapshot = await runtime.runPromise(navigateTo("/users/42?tab=profile"));

    await runtime.dispose();

    expect(snapshot.status).toBe("success");
    expect(snapshot.match?.route.id).toBe("users.show");
    expect(snapshot.loaders["load-user"]?._tag).toBe("success");
    expect(snapshot.loaders["load-view"]?._tag).toBe("success");
  });

  it("marks snapshot as failure when a loader fails", async () => {
    const brokenRoute = defineRoute({
      id: "broken",
      path: "/broken",
    });

    const loadBroken = defineLoader({
      name: "load-broken",
      routeId: brokenRoute.id,
      run: () => Effect.die("loader-failure"),
    });

    const runtime = createAppRuntime({
      routes: [brokenRoute] as const,
      loaders: [loadBroken] as const,
    });

    const failureExit = await runtime.runPromise(
      Effect.exit(navigateTo("/broken")),
    );
    expect(failureExit._tag).toBe("Failure");
    if (failureExit._tag === "Failure") {
      const failure = Cause.failureOption(failureExit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(NavigationRuntimeError);
      }
    }

    const snapshot = await runtime.runPromise(
      Effect.flatMap(Navigation, (service) => service.getSnapshot),
    );

    await runtime.dispose();

    expect(snapshot.status).toBe("failure");
    expect(snapshot.loaders["load-broken"]?._tag).toBe("failure");
    expect(snapshot.error).toEqual(
      expect.objectContaining({
        _tag: "failure",
      }),
    );
  });

  it("revalidates by re-running loaders for the current href", async () => {
    const userRoute = defineRoute({
      id: "users.show.revalidate",
      path: "/users/:id",
      search: Schema.Struct({ tab: Schema.String }),
    });

    let runs = 0;

    const loadUser = defineLoader({
      name: "load-user-revalidate",
      routeId: userRoute.id,
      run: ({ params }) =>
        Effect.sync(() => {
          runs += 1;
          return {
            id: params["id"],
            runs,
          } as const;
        }),
    });

    const runtime = createAppRuntime({
      routes: [userRoute] as const,
      loaders: [loadUser] as const,
    });

    const first = await runtime.runPromise(navigateTo("/users/42?tab=profile"));
    const second = await runtime.runPromise(
      Effect.flatMap(Navigation, (service) => service.revalidate()),
    );

    await runtime.dispose();

    expect(first.status).toBe("success");
    expect(first.href).toBe("/users/42?tab=profile");
    expect(first.loaders["load-user-revalidate"]).toEqual({
      _tag: "success",
      value: {
        id: "42",
        runs: 1,
      },
    });

    expect(second.status).toBe("success");
    expect(second.href).toBe("/users/42?tab=profile");
    expect(second.loaders["load-user-revalidate"]).toEqual({
      _tag: "success",
      value: {
        id: "42",
        runs: 2,
      },
    });
  });

  it("cancels in-flight navigation when a new navigation starts", async () => {
    const slowRoute = defineRoute({
      id: "slow",
      path: "/slow",
    });

    const fastRoute = defineRoute({
      id: "fast",
      path: "/fast",
    });

    const loadSlow = defineLoader({
      name: "load-slow",
      routeId: slowRoute.id,
      run: () => Effect.sleep("200 millis").pipe(Effect.as("slow")),
    });

    const loadFast = defineLoader({
      name: "load-fast",
      routeId: fastRoute.id,
      run: () => Effect.succeed("fast"),
    });

    const runtime = createAppRuntime({
      routes: [slowRoute, fastRoute] as const,
      loaders: [loadSlow, loadFast] as const,
    });

    const slowNavigation = runtime.runPromise(
      Effect.exit(navigateTo("/slow")),
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    const fastSnapshot = await runtime.runPromise(navigateTo("/fast"));
    const slowResult = await slowNavigation;
    const currentSnapshot = await runtime.runPromise(
      Effect.flatMap(Navigation, (service) => service.getSnapshot),
    );

    await runtime.dispose();

    expect(fastSnapshot.status).toBe("success");
    expect(fastSnapshot.match?.route.id).toBe("fast");
    expect(currentSnapshot.status).toBe("success");
    expect(currentSnapshot.pathname).toBe("/fast");

    expect(slowResult._tag).toBe("Failure");
    if (slowResult._tag === "Failure") {
      const failure = Cause.failureOption(slowResult.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(NavigationCancelledError);
        expect((failure.value as NavigationCancelledError).pathname).toBe("/slow");
      }
    }
  });
});
