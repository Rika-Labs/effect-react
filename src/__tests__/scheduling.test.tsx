import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import {
  createScheduledRunner,
  useIntervalEffect,
  useScheduledEffect,
  useTimeoutEffect,
} from "../scheduling";

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduling primitives", () => {
  it("runs interval scheduled runner until canceled", () => {
    vi.useFakeTimers();
    const runner = createScheduledRunner({ kind: "interval", every: 5 });
    let count = 0;
    runner.run(() => {
      count += 1;
    });

    vi.advanceTimersByTime(16);
    runner.cancel();
    vi.advanceTimersByTime(20);

    expect(count).toBe(3);
    expect(runner.isRunning()).toBe(false);
  });

  it("replaces an existing interval schedule when run is called twice", () => {
    vi.useFakeTimers();
    const runner = createScheduledRunner({ kind: "interval", every: 10 });
    let count = 0;

    runner.run(() => {
      count += 1;
    });
    vi.advanceTimersByTime(11);
    expect(count).toBe(1);

    runner.run(() => {
      count += 10;
    });
    vi.advanceTimersByTime(11);
    expect(count).toBe(11);
    runner.cancel();
  });

  it("runs timeout scheduled runner once", () => {
    vi.useFakeTimers();
    const runner = createScheduledRunner({ kind: "timeout", after: 10 });
    let count = 0;
    runner.run(() => {
      count += 1;
    });

    vi.advanceTimersByTime(9);
    expect(count).toBe(0);
    vi.advanceTimersByTime(1);
    expect(count).toBe(1);
    expect(runner.isRunning()).toBe(false);
  });

  it("cancels a timeout schedule and allows rerun", () => {
    vi.useFakeTimers();
    const runner = createScheduledRunner({ kind: "timeout", after: 10 });
    let count = 0;

    runner.cancel();
    runner.run(() => {
      count += 1;
    });
    runner.cancel();
    vi.advanceTimersByTime(20);
    expect(count).toBe(0);
    expect(runner.isRunning()).toBe(false);

    runner.run(() => {
      count += 1;
    });
    vi.advanceTimersByTime(10);
    expect(count).toBe(1);
  });

  it("useIntervalEffect executes repeatedly and cleans up on unmount", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let count = 0;

    const Probe = () => {
      useIntervalEffect(
        Effect.sync(() => {
          count += 1;
        }),
        10,
      );
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await vi.advanceTimersByTimeAsync(31);
    expect(count).toBe(3);
    view.unmount();
    await vi.advanceTimersByTimeAsync(20);
    expect(count).toBe(3);
    await runtime.dispose();
  });

  it("useTimeoutEffect executes once", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let count = 0;

    const Probe = () => {
      useTimeoutEffect(
        Effect.sync(() => {
          count += 1;
        }),
        10,
      );
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(count).toBe(1);
    });
    await runtime.dispose();
  });

  it("useScheduledEffect respects enabled flag", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let count = 0;

    const Probe = ({ enabled }: { enabled: boolean }) => {
      useScheduledEffect(
        Effect.sync(() => {
          count += 1;
        }),
        { kind: "interval", every: 5 },
        enabled,
      );
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe enabled={false} />
      </EffectProvider>,
    );

    await vi.advanceTimersByTimeAsync(20);
    expect(count).toBe(0);

    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe enabled={true} />
      </EffectProvider>,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(count).toBe(2);
    await runtime.dispose();
  });

  it("useScheduledEffect recreates schedule on prop change", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    let count = 0;

    const Probe = ({ every }: { every: number }) => {
      useScheduledEffect(
        Effect.sync(() => {
          count += 1;
        }),
        { kind: "interval", every },
      );
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe every={10} />
      </EffectProvider>,
    );

    await vi.advanceTimersByTimeAsync(11);
    expect(count).toBe(1);

    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe every={5} />
      </EffectProvider>,
    );

    await vi.advanceTimersByTimeAsync(6);
    expect(count).toBe(2);

    view.unmount();
    await runtime.dispose();
  });
});
