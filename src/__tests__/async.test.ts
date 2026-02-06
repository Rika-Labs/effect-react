import { Cause, Effect, Exit, Option } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CircuitOpenError,
  createCircuitBreaker,
  createLatestTokenGuard,
  runLatestPromise,
} from "../async";

afterEach(() => {
  vi.useRealTimers();
});

describe("latest token guard", () => {
  it("guards latest promise results", async () => {
    vi.useFakeTimers();
    const guard = createLatestTokenGuard();
    expect(guard.current()).toBe(0);

    const slow = runLatestPromise(guard, async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      return 1;
    });
    const fast = runLatestPromise(guard, async () => 2);

    await expect(fast).resolves.toEqual({ stale: false, value: 2 });
    await vi.advanceTimersByTimeAsync(11);
    await expect(slow).resolves.toEqual({ stale: true });

    const token = guard.issue();
    expect(guard.isCurrent(token)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(token)).toBe(false);
    await expect(
      runLatestPromise(guard, async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});

describe("circuit breaker", () => {
  it("opens after reaching failure threshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, resetTimeout: 1000 });
    expect(cb.state()).toBe("closed");

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(cb.state()).toBe("closed");

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(cb.state()).toBe("open");
    cb.reset();
  });

  it("throws CircuitOpenError when open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(cb.state()).toBe("open");

    await expect(cb.execute(async () => "ok")).rejects.toBeInstanceOf(CircuitOpenError);
    cb.reset();
  });

  it("transitions to half-open after reset timeout", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 500 });

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    expect(cb.state()).toBe("open");

    await vi.advanceTimersByTimeAsync(501);
    expect(cb.state()).toBe("half-open");
    cb.reset();
  });

  it("transitions from half-open to closed after success", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 100 });

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(101);
    expect(cb.state()).toBe("half-open");

    await cb.execute(async () => "ok");
    expect(cb.state()).toBe("closed");
    cb.reset();
  });

  it("transitions from half-open back to open on failure", async () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 100 });

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(101);
    expect(cb.state()).toBe("half-open");

    await expect(
      cb.execute(async () => {
        throw new Error("fail again");
      }),
    ).rejects.toThrow();
    expect(cb.state()).toBe("open");
    cb.reset();
  });

  it("resets all state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });
    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    expect(cb.state()).toBe("open");

    cb.reset();
    expect(cb.state()).toBe("closed");
    expect(cb.stats().failures).toBe(0);
    expect(cb.stats().successes).toBe(0);
    expect(cb.stats().lastFailureAt).toBeNull();
  });

  it("reports stats correctly", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, resetTimeout: 1000 });
    await cb.execute(async () => "ok");
    expect(cb.stats()).toEqual({ state: "closed", failures: 0, successes: 0, lastFailureAt: null });

    await expect(
      cb.execute(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();
    expect(cb.stats().failures).toBe(1);
    expect(cb.stats().state).toBe("closed");
    cb.reset();
  });

  it("executes effects through circuit breaker", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 1000 });

    const result = await Effect.runPromise(cb.executeEffect(Effect.succeed(42)));
    expect(result).toBe(42);

    const failExit = await Effect.runPromiseExit(cb.executeEffect(Effect.fail("err")));
    expect(Exit.isFailure(failExit)).toBe(true);
    expect(cb.state()).toBe("open");

    const openExit = await Effect.runPromiseExit(cb.executeEffect(Effect.succeed(1)));
    expect(Exit.isFailure(openExit)).toBe(true);
    if (Exit.isFailure(openExit)) {
      const failure = Cause.failureOption(openExit.cause);
      expect(Option.isSome(failure) && failure.value instanceof CircuitOpenError).toBe(true);
    }
    cb.reset();
  });
});
