import { describe, expect, it } from "vitest";
import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { runEffect } from "../internal/effectRunner";

describe("runEffect", () => {
  it("resolves success exits", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const handle = runEffect(runtime, Effect.succeed(123));
    const exit = await handle.promise;
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toBe(123);
    }
    await runtime.dispose();
  });

  it("cancels and runs finalizers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let acquired = 0;
    let finalized = 0;

    const effect = Effect.acquireRelease(
      Effect.sync(() => {
        acquired += 1;
        return "resource";
      }),
      () =>
        Effect.sync(() => {
          finalized += 1;
        }),
    ).pipe(Effect.andThen(Effect.never));

    const handle = runEffect(runtime, effect);
    while (acquired === 0) {
      await Promise.resolve();
    }
    handle.cancel();
    handle.cancel();

    const exit = await handle.promise;
    expect(Exit.isFailure(exit)).toBe(true);
    expect(finalized).toBe(1);
    await runtime.dispose();
  });
});
