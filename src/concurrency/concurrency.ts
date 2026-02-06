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
  readonly reject: (reason: unknown) => void;
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
    run: async <A>(task: () => A | Promise<A>) =>
      new Promise<A>((resolve, reject) => {
        const execute = () => {
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              active = Math.max(0, active - 1);
              drain();
            });
        };

        queue.push({
          execute,
          reject,
        });
        drain();
      }),
    active: () => active,
    pending: () => queue.length,
    clear: (reason?: string) => {
      const pending = queue.splice(0, queue.length);
      for (const entry of pending) {
        entry.reject(new QueueCanceledError(reason));
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
      void Promise.resolve()
        .then(() => next.execute())
        .finally(() => {
          active = Math.max(0, active - 1);
          releaseWaiter();
          schedule();
        });
    }
  };

  const waitForCapacity = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

  const isAtCapacity = (): boolean => queue.length + active >= capacity;

  const enqueueTask = async <A>(task: () => A | Promise<A>): Promise<A> => {
    while (isAtCapacity()) {
      if (overflow === "drop") {
        throw new QueueOverflowError("Task dropped because queue is full");
      }
      if (overflow === "slide") {
        const dropped = queue.shift();
        dropped?.reject(new QueueOverflowError("Task removed by sliding policy"));
        break;
      }
      await waitForCapacity();
    }

    return new Promise<A>((resolve, reject) => {
      queue.push({
        execute: () => {
          Promise.resolve().then(task).then(resolve, reject);
        },
        reject,
      });
      schedule();
    });
  };

  return {
    enqueue: enqueueTask,
    size: () => queue.length,
    active: () => active,
    pending: () => queue.length,
    clear: (reason?: string) => {
      const pending = queue.splice(0, queue.length);
      for (const entry of pending) {
        entry.reject(new QueueCanceledError(reason));
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
  const waitingRejectors = new Set<(reason: unknown) => void>();
  let pending = 0;
  let canceled: QueueCanceledError | null = null;

  const acquire = async (): Promise<void> => {
    while (true) {
      if (canceled) {
        throw canceled;
      }
      const now = Date.now();
      while (starts.length > 0) {
        const firstStart = starts[0];
        if (firstStart === undefined || now - firstStart < intervalMs) {
          break;
        }
        starts.shift();
      }
      if (starts.length < limit) {
        starts.push(now);
        return;
      }
      const firstStart = starts[0]!;
      const waitMs = Math.max(0, intervalMs - (now - firstStart));
      await new Promise<void>((resolve, reject) => {
        const rejector = (reason: unknown) => {
          waitingRejectors.delete(rejector);
          reject(reason);
        };
        waitingRejectors.add(rejector);
        setTimeout(() => {
          waitingRejectors.delete(rejector);
          resolve();
        }, waitMs);
      });
    }
  };

  return {
    run: async <A>(task: () => A | Promise<A>) => {
      pending += 1;
      try {
        await acquire();
        return await Promise.resolve().then(task);
      } finally {
        pending = Math.max(0, pending - 1);
      }
    },
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
