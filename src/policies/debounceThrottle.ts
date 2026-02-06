import { useCallback, useEffect, useRef } from "react";
import type { Effect, Exit } from "effect";
import { toMillis, type DurationInput } from "../internal/duration";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { useRuntime } from "../provider/useRuntime";

export class PolicyCanceledError extends Error {
  constructor(message = "Policy execution canceled") {
    super(message);
    this.name = "PolicyCanceledError";
  }
}

export interface ExecutionPolicy {
  readonly run: <A>(task: () => A | Promise<A>) => Promise<A>;
  readonly cancel: (reason?: string) => void;
  readonly pending: () => boolean;
}

interface PendingTask<A> {
  readonly task: () => A | Promise<A>;
  readonly resolve: (value: A | PromiseLike<A>) => void;
  readonly reject: (reason?: unknown) => void;
}

export const createDebouncePolicy = (duration: DurationInput): ExecutionPolicy => {
  const durationMs = toMillis(duration);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingTask: PendingTask<unknown> | undefined;

  const clearPending = (reason?: string) => {
    if (pendingTask !== undefined) {
      const currentPending = pendingTask;
      queueMicrotask(() => {
        currentPending.reject(new PolicyCanceledError(reason));
      });
      pendingTask = undefined;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return {
    run: <A>(task: () => A | Promise<A>) =>
      new Promise<A>((resolve, reject) => {
        clearPending("Debounced task replaced");
        pendingTask = {
          task,
          resolve: resolve as (value: unknown) => void,
          reject,
        };
        timer = setTimeout(() => {
          timer = undefined;
          const current = pendingTask as PendingTask<A> | undefined;
          pendingTask = undefined;
          if (current === undefined) {
            reject(new PolicyCanceledError("Debounced task missing"));
            return;
          }
          Promise.resolve(current.task()).then(current.resolve, current.reject);
        }, durationMs);
      }),
    cancel: (reason?: string) => {
      clearPending(reason ?? "Debounced task canceled");
    },
    pending: () => pendingTask !== undefined,
  };
};

export const createThrottlePolicy = (duration: DurationInput): ExecutionPolicy => {
  const durationMs = toMillis(duration);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let blocked = false;
  let queuedTask: PendingTask<unknown> | undefined;

  const drain = () => {
    if (queuedTask === undefined) {
      blocked = false;
      timer = undefined;
      return;
    }
    const current = queuedTask;
    queuedTask = undefined;
    Promise.resolve(current.task()).then(current.resolve, current.reject);
    timer = setTimeout(drain, durationMs);
  };

  return {
    run: <A>(task: () => A | Promise<A>) =>
      new Promise<A>((resolve, reject) => {
        if (!blocked) {
          blocked = true;
          Promise.resolve(task()).then(resolve, reject);
          timer = setTimeout(drain, durationMs);
          return;
        }
        if (queuedTask !== undefined) {
          const previousQueued = queuedTask;
          queueMicrotask(() => {
            previousQueued.reject(new PolicyCanceledError("Throttled task replaced"));
          });
        }
        queuedTask = {
          task,
          resolve: resolve as (value: unknown) => void,
          reject,
        };
      }),
    cancel: (reason?: string) => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      blocked = false;
      if (queuedTask !== undefined) {
        const currentQueued = queuedTask;
        queueMicrotask(() => {
          currentQueued.reject(new PolicyCanceledError(reason ?? "Throttled task canceled"));
        });
        queuedTask = undefined;
      }
    },
    pending: () => queuedTask !== undefined,
  };
};

const resolveEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> => (typeof effect === "function" ? effect() : effect);

export const useDebouncedRunner = (duration: DurationInput) => {
  const runtime = useRuntime();
  const policyRef = useRef<ExecutionPolicy>(createDebouncePolicy(duration));
  const activeHandleRef = useRef<EffectRunHandle<unknown, unknown> | null>(null);

  useEffect(() => {
    policyRef.current.cancel("Debounce policy replaced");
    policyRef.current = createDebouncePolicy(duration);
    return () => {
      policyRef.current.cancel("Debounce policy disposed");
      activeHandleRef.current?.cancel();
      activeHandleRef.current = null;
    };
  }, [duration]);

  const run = useCallback(
    <A, E, R>(effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)) =>
      policyRef.current.run(() => {
        activeHandleRef.current?.cancel();
        const handle = runEffect(runtime, resolveEffect(effect));
        activeHandleRef.current = handle as EffectRunHandle<unknown, unknown>;
        return handle.promise as Promise<Exit.Exit<A, E>>;
      }),
    [runtime],
  );

  const cancel = useCallback((reason?: string) => {
    policyRef.current.cancel(reason);
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
  }, []);

  return {
    run,
    cancel,
    pending: () => policyRef.current.pending(),
  };
};

export const useThrottledRunner = (duration: DurationInput) => {
  const runtime = useRuntime();
  const policyRef = useRef<ExecutionPolicy>(createThrottlePolicy(duration));
  const activeHandleRef = useRef<EffectRunHandle<unknown, unknown> | null>(null);

  useEffect(() => {
    policyRef.current.cancel("Throttle policy replaced");
    policyRef.current = createThrottlePolicy(duration);
    return () => {
      policyRef.current.cancel("Throttle policy disposed");
      activeHandleRef.current?.cancel();
      activeHandleRef.current = null;
    };
  }, [duration]);

  const run = useCallback(
    <A, E, R>(effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)) =>
      policyRef.current.run(() => {
        activeHandleRef.current?.cancel();
        const handle = runEffect(runtime, resolveEffect(effect));
        activeHandleRef.current = handle as EffectRunHandle<unknown, unknown>;
        return handle.promise as Promise<Exit.Exit<A, E>>;
      }),
    [runtime],
  );

  const cancel = useCallback((reason?: string) => {
    policyRef.current.cancel(reason);
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
  }, []);

  return {
    run,
    cancel,
    pending: () => policyRef.current.pending(),
  };
};
