import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import { Data, defineQuery, fetchQuery } from "../../data";
import { defineRoute } from "../../navigation";

describe("data service", () => {
  it("fetches, stores snapshot, and invalidates", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [home] as const,
      data: {
        capacity: 32,
        timeToLive: "1 minute",
      },
    });

    const getDouble = defineQuery({
      name: "double",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      run: ({ value }) => Effect.succeed(value * 2),
    });

    const value = await runtime.runPromise(fetchQuery(getDouble, { value: 21 }));
    expect(value).toBe(42);

    const snapshotAfterFetch = await runtime.runPromise(
      Effect.flatMap(Data, (data) => data.getSnapshot(getDouble, { value: 21 })),
    );

    expect(snapshotAfterFetch.phase).toBe("success");
    expect(snapshotAfterFetch.data).toBe(42);

    await runtime.runPromise(
      Effect.flatMap(Data, (data) => data.invalidate(getDouble, { value: 21 })),
    );

    const snapshotAfterInvalidate = await runtime.runPromise(
      Effect.flatMap(Data, (data) => data.getSnapshot(getDouble, { value: 21 })),
    );

    await runtime.dispose();

    expect(snapshotAfterInvalidate.phase).toBe("initial");
    expect(snapshotAfterInvalidate.data).toBeUndefined();
  });
});
