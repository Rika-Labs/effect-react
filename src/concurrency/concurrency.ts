import { Cause, Effect, Exit } from "effect";
import { useCallback, useEffect, useRef } from "react";
import { toMillis, type DurationInput } from "../internal/duration";

export class QueueOverflowError extends Error {
  constructor(message = "Task queue overflow") {
    super(message);
    this.name = "QueueOverflowError";
  }
}

export class QueueCanceledError extends Error {
  constructor(message = "Task queue canceled") {
    super(message);
    this.name = "QueueCanceledError";
  }
}

export type QueueOverflowStrategy = "backpressure" | "drop" | "slide";

export interface ConcurrencyRunner {
  readonly run: <A>(task: () => A | Promise<A>) => Promise<A>;
  readonly active: () => number;
  readonly pending: () => number;
  readonly clear: (reason?: string) => void;
}

interface QueueTask {
  readonly execute: () => void;
  readonly fail: (reason: unknown) => void;
}

export interface TaskQueueOptions {
  readonly capacity: number;
  readonly concurrency?: number;
  readonly overflow?: QueueOverflowStrategy;
}

export interface TaskQueue {
  readonly enqueue: <A>(task: () => A | Promise<A>) => Promise<A>;
  readonly size: () => number;
  readonly active: () => number;
  readonly pending: () => number;
  readonly clear: (reason?: string) => void;
}

const ensurePositiveInteger = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
};

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { readonly then?: unknown }).then === "function";

const fromTaskEffect = <A>(task: () => A | Promise<A>): Effect.Effect<A, unknown, never> =>
  Effect.try({
    try: task,
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((value) =>
      isPromiseLike<A>(value)
        ? Effect.tryPromise({
            try: () => value,
            catch: (cause) => cause,
          })
        : Effect.succeed(value),
    ),
  );

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

const fromExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E, never> =>
  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

export const withConcurrencyLimit = (permits: number): ConcurrencyRunner => {
  const maxPermits = ensurePositiveInteger(permits, "permits");
  let active = 0;
  const queue: QueueTask[] = [];

  const drain = (): void => {
    while (active < maxPermits && queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      active += 1;
      next.execute();
    }
  };

  return {
    run: <A>(task: () => A | Promise<A>) =>
      runEffectWithSquashedCause(
        Effect.async<A, unknown>((resume) => {
          const finalize = (exit: Exit.Exit<A, unknown>) => {
            active = Math.max(0, active - 1);
            drain();
            resume(fromExit(exit));
          };

          const entry: QueueTask = {
            execute: () => {
              Effect.runCallback(fromTaskEffect(task), {
                onExit: (exit) => {
                  finalize(exit as Exit.Exit<A, unknown>);
                },
              });
            },
            fail: (reason) => {
              resume(Effect.fail(reason));
            },
          };

          queue.push(entry);
          drain();

          return Effect.void;
        }),
      ),
    active: () => active,
    pending: () => queue.length,
    clear: (reason?: string) => {
      const pending = queue.splice(0, queue.length);
      for (const entry of pending) {
        entry.fail(new QueueCanceledError(reason));
      }
    },
  };
};

export const createTaskQueue = (options: TaskQueueOptions): TaskQueue => {
  const capacity = ensurePositiveInteger(options.capacity, "capacity");
  const concurrency = ensurePositiveInteger(options.concurrency ?? 1, "concurrency");
  const overflow = options.overflow ?? "backpressure";

  let active = 0;
  const queue: QueueTask[] = [];
  const waiters: (() => void)[] = [];

  const releaseWaiter = (): void => {
    if (waiters.length === 0) {
      return;
    }
    const next = waiters.shift();
    next?.();
  };

  const schedule = (): void => {
    while (queue.length > 0 && active < concurrency) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      active += 1;
      next.execute();
    }
  };

  const waitForCapacityEffect = (): Effect.Effect<void, never, never> =>
    Effect.async<void, never>((resume) => {
      const waiter = () => {
        resume(Effect.void);
      };
      waiters.push(waiter);
      return Effect.sync(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
      });
    });

  const isAtCapacity = (): boolean => queue.length + active >= capacity;

  const enqueueTask = <A>(task: () => A | Promise<A>): Promise<A> =>
    runEffectWithSquashedCause(
      Effect.gen(function* () {
        while (isAtCapacity()) {
          if (overflow === "drop") {
            yield* Effect.fail(new QueueOverflowError("Task dropped because queue is full"));
          }
          if (overflow === "slide") {
            const dropped = queue.shift();
            dropped?.fail(new QueueOverflowError("Task removed by sliding policy"));
            break;
          }
          yield* waitForCapacityEffect();
        }

        return yield* Effect.async<A, unknown>((resume) => {
          const finalize = (exit: Exit.Exit<A, unknown>) => {
            active = Math.max(0, active - 1);
            releaseWaiter();
            schedule();
            resume(fromExit(exit));
          };

          const entry: QueueTask = {
            execute: () => {
              Effect.runCallback(fromTaskEffect(task), {
                onExit: (exit) => {
                  finalize(exit as Exit.Exit<A, unknown>);
                },
              });
            },
            fail: (reason) => {
              resume(Effect.fail(reason));
            },
          };

          queue.push(entry);
          schedule();

          return Effect.void;
        });
      }),
    );

  return {
    enqueue: enqueueTask,
    size: () => queue.length,
    active: () => active,
    pending: () => queue.length,
    clear: (reason?: string) => {
      const pending = queue.splice(0, queue.length);
      for (const entry of pending) {
        entry.fail(new QueueCanceledError(reason));
      }
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.();
      }
    },
  };
};

export interface RateLimitedRunnerOptions {
  readonly limit: number;
  readonly interval: DurationInput;
}

export interface RateLimitedRunner {
  readonly run: <A>(task: () => A | Promise<A>) => Promise<A>;
  readonly pending: () => number;
  readonly clear: (reason?: string) => void;
}

export const createRateLimitedRunner = (options: RateLimitedRunnerOptions): RateLimitedRunner => {
  const limit = ensurePositiveInteger(options.limit, "limit");
  const intervalMs = toMillis(options.interval);
  const starts: number[] = [];
  const waitingRejectors = new Set<(reason: QueueCanceledError) => void>();
  let pending = 0;
  let canceled: QueueCanceledError | null = null;

  const waitForTurnEffect = (waitMs: number): Effect.Effect<void, QueueCanceledError, never> =>
    Effect.async<void, QueueCanceledError>((resume) => {
      const rejector = (reason: QueueCanceledError) => {
        waitingRejectors.delete(rejector);
        clearTimeout(timeout);
        resume(Effect.fail(reason));
      };
      waitingRejectors.add(rejector);
      const timeout = setTimeout(() => {
        waitingRejectors.delete(rejector);
        resume(Effect.void);
      }, waitMs);
      return Effect.void;
    });

  const acquireEffect = (): Effect.Effect<void, QueueCanceledError, never> =>
    Effect.gen(function* () {
      while (true) {
        const now = Date.now();
        while (starts.length > 0 && now - starts[0]! >= intervalMs) {
          starts.shift();
        }
        if (starts.length < limit) {
          starts.push(now);
          return;
        }
        const firstStart = starts[0]!;
        const waitMs = Math.max(0, intervalMs - (now - firstStart));
        yield* waitForTurnEffect(waitMs);
      }
    });

  return {
    run: <A>(task: () => A | Promise<A>) =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          pending += 1;
          if (canceled) {
            yield* Effect.fail(canceled);
          }
          yield* acquireEffect();
          return yield* fromTaskEffect(task);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              pending = Math.max(0, pending - 1);
            }),
          ),
        ),
      ),
    pending: () => pending,
    clear: (reason?: string) => {
      canceled = new QueueCanceledError(reason ?? "Rate limited runner canceled");
      for (const reject of waitingRejectors) {
        reject(canceled);
      }
      waitingRejectors.clear();
    },
  };
};

export interface UseSemaphoreResult {
  readonly run: <A>(task: () => A | Promise<A>) => Promise<A>;
  readonly active: () => number;
  readonly pending: () => number;
  readonly clear: (reason?: string) => void;
}

export const useSemaphore = (permits: number): UseSemaphoreResult => {
  const runnerRef = useRef(withConcurrencyLimit(permits));

  useEffect(() => {
    runnerRef.current.clear("Semaphore permits changed");
    runnerRef.current = withConcurrencyLimit(permits);

    return () => {
      runnerRef.current.clear("Semaphore disposed");
    };
  }, [permits]);

  const run = useCallback(<A>(task: () => A | Promise<A>) => runnerRef.current.run(task), []);
  const active = useCallback(() => runnerRef.current.active(), []);
  const pending = useCallback(() => runnerRef.current.pending(), []);
  const clear = useCallback((reason?: string) => runnerRef.current.clear(reason), []);

  return {
    run,
    active,
    pending,
    clear,
  };
};
