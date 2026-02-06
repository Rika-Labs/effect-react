import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  QueueCanceledError,
  QueueOverflowError,
  createRateLimitedRunner,
  createTaskQueue,
  useSemaphore,
  withConcurrencyLimit,
} from "../concurrency";

afterEach(() => {
  vi.useRealTimers();
});

describe("concurrency primitives", () => {
  it("enforces concurrency limits and runs queued tasks", async () => {
    const runner = withConcurrencyLimit(1);
    const order: string[] = [];
    let resolveFirst: ((value: string) => void) | undefined;

    const first = runner.run(
      () =>
        new Promise<string>((resolve) => {
          order.push("first-start");
          resolveFirst = resolve;
        }),
    );
    const second = runner.run(async () => {
      order.push("second-start");
      return "second";
    });

    await Promise.resolve();
    expect(runner.active()).toBe(1);
    expect(runner.pending()).toBe(1);

    resolveFirst!("first");
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first-start", "second-start"]);
  });

  it("clears pending concurrency tasks", async () => {
    const runner = withConcurrencyLimit(1);
    let resolveFirst: ((value: string) => void) | undefined;

    const first = runner.run(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = runner.run(async () => "second");

    await Promise.resolve();
    runner.clear("stop");

    const rejected = await second.then(
      () => null,
      (error: unknown) => error,
    );

    expect(rejected).toBeInstanceOf(QueueCanceledError);
    resolveFirst!("first");
    await expect(first).resolves.toBe("first");
  });

  it("supports task queue overflow strategies", async () => {
    const dropQueue = createTaskQueue({ capacity: 1, overflow: "drop" });
    let resolveDrop: ((value: string) => void) | undefined;

    const dropFirst = dropQueue.enqueue(
      () =>
        new Promise<string>((resolve) => {
          resolveDrop = resolve;
        }),
    );
    const dropped = dropQueue.enqueue(async () => "second");

    await expect(dropped).rejects.toBeInstanceOf(QueueOverflowError);
    resolveDrop!("first");
    await expect(dropFirst).resolves.toBe("first");

    const slideQueue = createTaskQueue({ capacity: 2, overflow: "slide" });
    let resolveSlide: ((value: string) => void) | undefined;

    const slideFirst = slideQueue.enqueue(
      () =>
        new Promise<string>((resolve) => {
          resolveSlide = resolve;
        }),
    );
    const slideSecond = slideQueue.enqueue(async () => "second");
    const slideThird = slideQueue.enqueue(async () => "third");

    await expect(slideSecond).rejects.toBeInstanceOf(QueueOverflowError);
    resolveSlide!("first");
    await expect(slideFirst).resolves.toBe("first");
    await expect(slideThird).resolves.toBe("third");
  });

  it("supports backpressure queue mode", async () => {
    const queue = createTaskQueue({ capacity: 1, overflow: "backpressure" });
    let resolveFirst: ((value: string) => void) | undefined;
    let secondStarted = false;

    const first = queue.enqueue(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const second = queue.enqueue(async () => {
      secondStarted = true;
      return "second";
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    await waitFor(() => {
      expect(resolveFirst).toBeTypeOf("function");
    });
    resolveFirst!("first");
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
  });

  it("rate limits task starts and supports cancellation", async () => {
    vi.useFakeTimers();
    const runner = createRateLimitedRunner({ limit: 1, interval: 10 });
    const starts: number[] = [];

    const first = runner.run(async () => {
      starts.push(Date.now());
      return "first";
    });
    const second = runner.run(async () => {
      starts.push(Date.now());
      return "second";
    });

    await Promise.resolve();
    await expect(first).resolves.toBe("first");
    expect(starts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(11);
    await expect(second).resolves.toBe("second");
    expect(starts).toHaveLength(2);

    const cancelRunner = createRateLimitedRunner({ limit: 1, interval: 100 });
    const keep = cancelRunner.run(async () => "keep");
    const waiting = cancelRunner.run(async () => "waiting");
    await expect(keep).resolves.toBe("keep");
    cancelRunner.clear("cancelled");
    await expect(waiting).rejects.toBeInstanceOf(QueueCanceledError);

    const stoppedRunner = createRateLimitedRunner({ limit: 1, interval: 100 });
    stoppedRunner.clear("stopped");
    await expect(stoppedRunner.run(async () => "never")).rejects.toBeInstanceOf(QueueCanceledError);
  });

  it("useSemaphore hook replaces runners when permits change", async () => {
    let api: ReturnType<typeof useSemaphore> | undefined;

    const Probe = ({ permits }: { readonly permits: number }) => {
      api = useSemaphore(permits);
      return null;
    };

    const view = render(<Probe permits={1} />);

    let resolveFirst: ((value: string) => void) | undefined;
    const first = api!.run(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = api!.run(async () => "second");

    await Promise.resolve();
    expect(api!.active()).toBe(1);
    expect(api!.pending()).toBe(1);

    view.rerender(<Probe permits={2} />);
    await expect(second).rejects.toBeInstanceOf(QueueCanceledError);
    resolveFirst!("first");
    await expect(first).resolves.toBe("first");

    const third = api!.run(async () => "third");
    const fourth = api!.run(async () => "fourth");
    await expect(third).resolves.toBe("third");
    await expect(fourth).resolves.toBe("fourth");

    view.unmount();
  });
});
