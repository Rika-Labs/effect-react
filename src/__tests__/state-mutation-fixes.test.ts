import { Effect, Exit, Layer, ManagedRuntime, SubscriptionRef } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runEffect } from "../internal/effectRunner";

afterEach(() => {
  vi.useRealTimers();
});

const selectCount = (v: { count: number; label: string }) => v.count;
const incrementBy5 = (v: number) => v + 5;
const increment = (v: number) => v + 1;
const selectCountTyped = (v: { count: number; label: string }) => v.count;
const equalsNumber = (a: number, b: number) => a === b;

describe("useSubscriptionRef set reads prev from SubscriptionRef (#5)", () => {
  it("reads previous value from SubscriptionRef.get instead of store snapshot", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(10));

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    const prev = Exit.isSuccess(prevExit) ? prevExit.value : -1;

    expect(prev).toBe(10);

    const setHandle = runEffect(runtime, SubscriptionRef.set(ref, 20));
    const setExit = await setHandle.promise;
    expect(Exit.isSuccess(setExit)).toBe(true);

    const afterHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const afterExit = await afterHandle.promise;
    expect(Exit.isSuccess(afterExit) ? afterExit.value : -1).toBe(20);

    await runtime.dispose();
  });

  it("prev value is typed as A, not S (selected type)", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make({ count: 5, label: "test" }));

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    const prev = Exit.isSuccess(prevExit) ? prevExit.value : { count: -1, label: "" };

    expect(prev).toEqual({ count: 5, label: "test" });
    expect(selectCount(prev)).toBe(5);

    await runtime.dispose();
  });
});

describe("useSubscriptionRef update reads prev before update (#16)", () => {
  it("computes next from updater(prev) instead of separate get", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(10));

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    const prev = Exit.isSuccess(prevExit) ? prevExit.value : -1;
    expect(prev).toBe(10);

    const updateHandle = runEffect(runtime, SubscriptionRef.update(ref, incrementBy5));
    const updateExit = await updateHandle.promise;
    expect(Exit.isSuccess(updateExit)).toBe(true);

    const next = incrementBy5(prev);
    expect(next).toBe(15);

    const verifyHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const verifyExit = await verifyHandle.promise;
    expect(Exit.isSuccess(verifyExit) ? verifyExit.value : -1).toBe(15);

    await runtime.dispose();
  });

  it("avoids TOCTOU by not reading after update", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(0));

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    const prev = Exit.isSuccess(prevExit) ? prevExit.value : -1;

    const updateHandle = runEffect(runtime, SubscriptionRef.update(ref, increment));
    await updateHandle.promise;

    const next = increment(prev);
    expect(next).toBe(1);

    const concurrentHandle = runEffect(runtime, SubscriptionRef.set(ref, 999));
    await concurrentHandle.promise;

    expect(next).toBe(1);

    await runtime.dispose();
  });
});

describe("useSubscriptionRef set/update failure paths (#48)", () => {
  it("set rejects when SubscriptionRef.set fails", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(10));

    await runtime.dispose();

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    expect(Exit.isFailure(prevExit)).toBe(true);
  });

  it("update rejects when SubscriptionRef.get fails", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(5));

    await runtime.dispose();

    const getHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const getExit = await getHandle.promise;
    expect(Exit.isFailure(getExit)).toBe(true);
  });

  it("equality short-circuit prevents store update when selected value unchanged", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make({ count: 1, label: "a" }));

    const prevHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const prevExit = await prevHandle.promise;
    const prev = Exit.isSuccess(prevExit) ? prevExit.value : { count: -1, label: "" };
    expect(selectCountTyped(prev)).toBe(1);

    const setHandle = runEffect(runtime, SubscriptionRef.set(ref, { count: 1, label: "b" }));
    await setHandle.promise;

    const afterHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const afterExit = await afterHandle.promise;
    const after = Exit.isSuccess(afterExit) ? afterExit.value : { count: -1, label: "" };
    expect(after.label).toBe("b");
    expect(equalsNumber(selectCountTyped(prev), selectCountTyped(after))).toBe(true);

    await runtime.dispose();
  });
});

describe("useMutation stale options ref (#6)", () => {
  it("optionsRef pattern keeps latest options without recreating callback", () => {
    let callCount = 0;
    const makeOptions = () => {
      callCount++;
      return {
        mutation: Effect.succeed("ok" as const),
        onSuccess: () => {},
      };
    };

    const ref = { current: makeOptions() };
    expect(callCount).toBe(1);

    ref.current = makeOptions();
    expect(callCount).toBe(2);

    expect(ref.current.mutation).toBeDefined();
    expect(ref.current.onSuccess).toBeDefined();
  });

  it("ref.current always reflects latest options object", () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const ref = { current: first as { id: number } };

    expect(ref.current.id).toBe(1);
    ref.current = second;
    expect(ref.current.id).toBe(2);
  });
});
