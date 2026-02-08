import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import { Data, defineQuery, fetchQuery } from "../../data";
import { defineRoute, navigateTo } from "../../navigation";
import { createHydrationScript, dehydrateAppState, hydrateAppState } from "../../render";

describe("hydration protocol", () => {
  it("dehydrates and rehydrates app state", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const getGreeting = defineQuery({
      name: "greeting",
      input: Schema.Struct({ name: Schema.String }),
      output: Schema.String,
      run: ({ name }) => Effect.succeed(`hello ${name}`),
    });

    const sourceRuntime = createAppRuntime({
      routes: [home] as const,
    });

    await sourceRuntime.runPromise(fetchQuery(getGreeting, { name: "Ada" }));
    await sourceRuntime.runPromise(navigateTo("/"));

    const dehydrated = await sourceRuntime.runPromise(dehydrateAppState());
    const script = createHydrationScript(dehydrated, "__v1_state");

    expect(script).toContain("__v1_state");
    expect(dehydrated.version).toBe(1);

    const targetRuntime = createAppRuntime({
      routes: [home] as const,
    });

    await targetRuntime.runPromise(hydrateAppState(dehydrated));

    const hydratedSnapshot = await targetRuntime.runPromise(
      Effect.flatMap(Data, (data) => data.getSnapshot(getGreeting, { name: "Ada" })),
    );

    await sourceRuntime.dispose();
    await targetRuntime.dispose();

    expect(hydratedSnapshot.phase).toBe("success");
    expect(hydratedSnapshot.data).toBe("hello Ada");
  });
});
