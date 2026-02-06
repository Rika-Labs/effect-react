import { describe, expect, it } from "vitest";
import {
  createOptimisticQueue,
  enqueueOptimisticMutation,
  replayPendingMutations,
  rollbackOptimisticMutation,
} from "../optimistic";

describe("optimistic queue primitives", () => {
  it("enqueues optimistic mutations and updates state", () => {
    const queue = createOptimisticQueue({ count: 0 });

    const id = enqueueOptimisticMutation(queue, {
      apply: (state) => ({ count: state.count + 1 }),
      rollback: (state) => ({ count: state.count - 1 }),
      execute: () => "done",
    });

    expect(queue.getState()).toEqual({ count: 1 });
    expect(queue.pendingIds()).toEqual([id]);
  });

  it("rolls back optimistic mutations by id", () => {
    const queue = createOptimisticQueue({ count: 0 });
    const id = enqueueOptimisticMutation(queue, {
      id: "mutation-1",
      apply: (state) => ({ count: state.count + 2 }),
      rollback: (state) => ({ count: state.count - 2 }),
      execute: () => "done",
    });

    expect(id).toBe("mutation-1");
    expect(rollbackOptimisticMutation(queue, "mutation-1")).toBe(true);
    expect(queue.getState()).toEqual({ count: 0 });
    expect(queue.pendingIds()).toEqual([]);
    expect(rollbackOptimisticMutation(queue, "missing")).toBe(false);
  });

  it("replays pending mutations in enqueue order", async () => {
    const queue = createOptimisticQueue({ value: 0 });
    const events: string[] = [];

    enqueueOptimisticMutation(queue, {
      id: "a",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => {
        events.push("a");
      },
    });
    enqueueOptimisticMutation(queue, {
      id: "b",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => {
        events.push("b");
      },
    });

    const result = await replayPendingMutations(queue);

    expect(result).toEqual({ completed: ["a", "b"], failed: [] });
    expect(events).toEqual(["a", "b"]);
    expect(queue.pendingIds()).toEqual([]);
    expect(queue.getState()).toEqual({ value: 2 });
  });

  it("rolls back failed replay and stops by default", async () => {
    const queue = createOptimisticQueue({ value: 0 });

    enqueueOptimisticMutation(queue, {
      id: "first",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => {
        throw new Error("fail");
      },
    });
    enqueueOptimisticMutation(queue, {
      id: "second",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => "ok",
    });

    const result = await replayPendingMutations(queue);

    expect(result).toEqual({ completed: [], failed: ["first"] });
    expect(queue.getState()).toEqual({ value: 1 });
    expect(queue.pendingIds()).toEqual(["second"]);
  });

  it("continues replay when continueOnError is enabled", async () => {
    const queue = createOptimisticQueue({ value: 0 });

    enqueueOptimisticMutation(queue, {
      id: "fail",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => {
        throw new Error("fail");
      },
    });
    enqueueOptimisticMutation(queue, {
      id: "ok",
      apply: (state) => ({ value: state.value + 1 }),
      rollback: (state) => ({ value: state.value - 1 }),
      execute: async () => "ok",
    });

    const result = await replayPendingMutations(queue, {
      continueOnError: true,
    });

    expect(result).toEqual({ completed: ["ok"], failed: ["fail"] });
    expect(queue.pendingIds()).toEqual([]);
    expect(queue.getState()).toEqual({ value: 1 });
  });
});
