import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import { defineLoader, defineRoute, navigateTo } from "../../navigation";

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
});
