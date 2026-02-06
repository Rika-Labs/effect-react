import { Effect, type Effect as EffectType } from "effect";
import { toMillis, type DurationInput } from "../internal/duration";

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  readonly state: CircuitState;
  constructor() {
    super("Circuit breaker is open");
    this.name = "CircuitOpenError";
    this.state = "open";
  }
}

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetTimeout: DurationInput;
  readonly halfOpenSuccesses?: number;
}

export interface CircuitBreakerStats {
  readonly state: CircuitState;
  readonly failures: number;
  readonly successes: number;
  readonly lastFailureAt: number | null;
}

export interface CircuitBreaker {
  readonly state: () => CircuitState;
  readonly execute: <A>(task: () => Promise<A>) => Promise<A>;
  readonly executeEffect: <A, E, R>(
    effect: EffectType.Effect<A, E, R>,
  ) => EffectType.Effect<A, E | CircuitOpenError, R>;
  readonly reset: () => void;
  readonly stats: () => CircuitBreakerStats;
}

export const createCircuitBreaker = (options: CircuitBreakerOptions): CircuitBreaker => {
  const resetTimeoutMs = toMillis(options.resetTimeout);
  const halfOpenSuccesses = options.halfOpenSuccesses ?? 1;
  let currentState: CircuitState = "closed";
  let failures = 0;
  let successes = 0;
  let lastFailureAt: number | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  const transitionToOpen = () => {
    currentState = "open";
    lastFailureAt = Date.now();
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      currentState = "half-open";
      successes = 0;
    }, resetTimeoutMs);
  };

  const recordSuccess = () => {
    if (currentState === "half-open") {
      successes += 1;
      if (successes >= halfOpenSuccesses) {
        currentState = "closed";
        failures = 0;
        successes = 0;
        lastFailureAt = null;
      }
    } else if (currentState === "closed") {
      failures = 0;
    }
  };

  const recordFailure = () => {
    failures += 1;
    if (currentState === "half-open") {
      transitionToOpen();
    } else if (failures >= options.failureThreshold) {
      transitionToOpen();
    }
  };

  const execute = async <A>(task: () => Promise<A>): Promise<A> => {
    if (currentState === "open") {
      throw new CircuitOpenError();
    }
    try {
      const result = await task();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure();
      throw error;
    }
  };

  const executeEffect = <A, E, R>(
    effect: EffectType.Effect<A, E, R>,
  ): EffectType.Effect<A, E | CircuitOpenError, R> => {
    if (currentState === "open") {
      return Effect.fail(new CircuitOpenError()) as EffectType.Effect<A, E | CircuitOpenError, R>;
    }
    return effect.pipe(
      Effect.tap(() => Effect.sync(() => recordSuccess())),
      Effect.tapErrorCause(() => Effect.sync(() => recordFailure())),
    ) as EffectType.Effect<A, E | CircuitOpenError, R>;
  };

  return {
    state: () => currentState,
    execute,
    executeEffect,
    reset: () => {
      currentState = "closed";
      failures = 0;
      successes = 0;
      lastFailureAt = null;
      if (resetTimer) clearTimeout(resetTimer);
    },
    stats: () => ({ state: currentState, failures, successes, lastFailureAt }),
  };
};
