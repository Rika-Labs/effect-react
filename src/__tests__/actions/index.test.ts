import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { defineAction, dispatchAction, runAction } from "../../actions";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";

describe("action service", () => {
  it("runs typed actions and dispatches wire results", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const increment = defineAction({
      name: "counter.increment",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ value }) => Effect.succeed({ value: value + 1 }),
    });

    const runtime = createAppRuntime({
      routes: [home] as const,
      actions: [increment] as const,
    });

    const value = await runtime.runPromise(runAction(increment, { value: 41 }));
    expect(value).toEqual({ value: 42 });

    const wire = await runtime.runPromise(dispatchAction(increment.name, { value: 5 }));

    await runtime.dispose();

    expect(wire._tag).toBe("success");
    if (wire._tag === "success") {
      expect(wire.value).toEqual({ value: 6 });
    }
  });
});
