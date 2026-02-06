import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import {
  PolicyCanceledError,
  createDebouncePolicy,
  createThrottlePolicy,
  useDebouncedRunner,
  useThrottledRunner,
} from "../policies";

type Settled<T> =
  | {
      readonly status: "success";
      readonly value: T;
    }
  | {
      readonly status: "failure";
      readonly error: unknown;
    };

const settle = function <T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ status: "success", value }),
    (error: unknown) => ({ status: "failure", error }),
  );
};

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce and throttle policies", () => {
  it("debounce only runs the latest task", async () => {
    vi.useFakeTimers();
    const policy = createDebouncePolicy(10);
    const events: string[] = [];

    const first = policy.run(async () => {
      events.push("first");
      return "first";
    });
    const firstHandled = settle(first);
    const second = policy.run(async () => {
      events.push("second");
      return "second";
    });

    await vi.advanceTimersByTimeAsync(11);
    const firstResult = await firstHandled;
    expect(firstResult.status).toBe("failure");
    if (firstResult.status === "failure") {
      expect(firstResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["second"]);
  });

  it("debounce cancel rejects pending task", async () => {
    vi.useFakeTimers();
    const policy = createDebouncePolicy(10);
    const task = policy.run(async () => "value");
    const handledTask = settle(task);
    policy.cancel("manual cancel");
    const result = await handledTask;
    expect(result.status).toBe("failure");
    if (result.status === "failure") {
      expect(result.error).toBeInstanceOf(PolicyCanceledError);
    }
    expect(policy.pending()).toBe(false);
  });

  it("debounce reports pending state and supports cancel with no pending task", async () => {
    vi.useFakeTimers();
    const policy = createDebouncePolicy(10);

    policy.cancel();
    expect(policy.pending()).toBe(false);

    const task = policy.run(async () => "value");
    expect(policy.pending()).toBe(true);

    await vi.advanceTimersByTimeAsync(11);
    await expect(task).resolves.toBe("value");
    expect(policy.pending()).toBe(false);
  });

  it("throttle runs first immediately and latest trailing task", async () => {
    vi.useFakeTimers();
    const policy = createThrottlePolicy(10);
    const events: string[] = [];

    const first = policy.run(async () => {
      events.push("first");
      return "first";
    });
    const second = policy.run(async () => {
      events.push("second");
      return "second";
    });
    const secondHandled = settle(second);
    const third = policy.run(async () => {
      events.push("third");
      return "third";
    });

    await expect(first).resolves.toBe("first");
    const secondResult = await secondHandled;
    expect(secondResult.status).toBe("failure");
    if (secondResult.status === "failure") {
      expect(secondResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    await vi.advanceTimersByTimeAsync(11);
    await expect(third).resolves.toBe("third");
    expect(events).toEqual(["first", "third"]);
  });

  it("throttle cancel rejects queued tasks and unblocks new tasks", async () => {
    vi.useFakeTimers();
    const policy = createThrottlePolicy(10);
    const first = policy.run(async () => "first");
    const queued = policy.run(async () => "queued");
    const queuedHandled = settle(queued);

    policy.cancel("manual");
    const queuedResult = await queuedHandled;
    expect(queuedResult.status).toBe("failure");
    if (queuedResult.status === "failure") {
      expect(queuedResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    await expect(first).resolves.toBe("first");
    expect(policy.pending()).toBe(false);

    await expect(policy.run(async () => "next")).resolves.toBe("next");
  });

  it("useDebouncedRunner executes latest effect and supports cancel", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let value = 0;
    let api: ReturnType<typeof useDebouncedRunner> | undefined;

    const Probe = () => {
      api = useDebouncedRunner(10);
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const first = api!.run(
      Effect.sync(() => {
        value = 1;
        return value;
      }),
    );
    const firstHandled = settle(first);
    const second = api!.run(
      Effect.sync(() => {
        value = 2;
        return value;
      }),
    );

    await vi.advanceTimersByTimeAsync(11);
    const firstResult = await firstHandled;
    expect(firstResult.status).toBe("failure");
    if (firstResult.status === "failure") {
      expect(firstResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    const exit = await second;
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(value).toBe(2);

    const pending = api!.run(Effect.succeed(3));
    const pendingHandled = settle(pending);
    api!.cancel();
    const pendingResult = await pendingHandled;
    expect(pendingResult.status).toBe("failure");
    if (pendingResult.status === "failure") {
      expect(pendingResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    await runtime.dispose();
  });

  it("useDebouncedRunner supports effect factories and policy replacement", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let api: ReturnType<typeof useDebouncedRunner> | undefined;
    let callCount = 0;

    const Probe = ({ delay }: { delay: number }) => {
      api = useDebouncedRunner(delay);
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe delay={20} />
      </EffectProvider>,
    );

    const first = api!.run(() =>
      Effect.sync(() => {
        callCount += 1;
        return callCount;
      }),
    );
    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe delay={5} />
      </EffectProvider>,
    );
    const firstResult = await settle(first);
    expect(firstResult.status).toBe("failure");

    const second = api!.run(() =>
      Effect.sync(() => {
        callCount += 1;
        return callCount;
      }),
    );

    await vi.advanceTimersByTimeAsync(6);
    const secondExit = await second;
    expect(Exit.isSuccess(secondExit)).toBe(true);
    expect(callCount).toBe(1);

    view.unmount();
    await runtime.dispose();
  });

  it("useThrottledRunner throttles effect executions", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const events: number[] = [];
    let api: ReturnType<typeof useThrottledRunner> | undefined;

    const Probe = () => {
      api = useThrottledRunner(10);
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const first = api!.run(
      Effect.sync(() => {
        events.push(1);
        return 1;
      }),
    );
    const second = api!.run(
      Effect.sync(() => {
        events.push(2);
        return 2;
      }),
    );
    const secondHandled = settle(second);
    const third = api!.run(
      Effect.sync(() => {
        events.push(3);
        return 3;
      }),
    );

    const secondResult = await secondHandled;
    expect(secondResult.status).toBe("failure");
    if (secondResult.status === "failure") {
      expect(secondResult.error).toBeInstanceOf(PolicyCanceledError);
    }
    await waitFor(() => {
      expect(events).toEqual([1, 3]);
    });

    const firstExit = await first;
    const thirdExit = await third;
    expect(Exit.isSuccess(firstExit)).toBe(true);
    expect(Exit.isSuccess(thirdExit)).toBe(true);
    await runtime.dispose();
  });

  it("useThrottledRunner supports cancel and effect factories", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let api: ReturnType<typeof useThrottledRunner> | undefined;
    let callCount = 0;

    const Probe = ({ delay }: { delay: number }) => {
      api = useThrottledRunner(delay);
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe delay={10} />
      </EffectProvider>,
    );

    const first = api!.run(() =>
      Effect.sync(() => {
        callCount += 1;
        return callCount;
      }),
    );
    const second = api!.run(() =>
      Effect.sync(() => {
        callCount += 1;
        return callCount;
      }),
    );
    await vi.advanceTimersByTimeAsync(11);
    const secondResult = await settle(second);
    expect(secondResult.status).toBe("success");

    const queued = api!.run(Effect.succeed(10));
    const queuedHandled = settle(queued);
    api!.cancel();
    const queuedResult = await queuedHandled;
    expect(queuedResult.status).toBe("failure");
    if (queuedResult.status === "failure") {
      expect(queuedResult.error).toBeInstanceOf(PolicyCanceledError);
    }

    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe delay={5} />
      </EffectProvider>,
    );

    const third = api!.run(() =>
      Effect.sync(() => {
        callCount += 1;
        return callCount;
      }),
    );
    const firstExit = await first;
    const thirdExit = await third;
    expect(Exit.isSuccess(firstExit)).toBe(true);
    expect(Exit.isSuccess(thirdExit)).toBe(true);

    view.unmount();
    await runtime.dispose();
  });
});
