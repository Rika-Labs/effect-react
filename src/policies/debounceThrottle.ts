import { useCallback, useEffect, useRef } from "react";
import { Cause, Effect, Exit } from "effect";
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
  readonly resume: (effect: Effect.Effect<A, unknown, never>) => void;
}

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
    Effect.flatMap((result) =>
      isPromiseLike<A>(result)
        ? Effect.tryPromise({
            try: () => result,
            catch: (cause) => cause,
          })
        : Effect.succeed(result),
    ),
  );

const fromExit = <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<A, E, never> =>
  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

export const createDebouncePolicy = (duration: DurationInput): ExecutionPolicy => {
  const durationMs = toMillis(duration);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingTask: PendingTask<unknown> | undefined;

  const clearPending = (reason?: string) => {
    if (pendingTask !== undefined) {
      const currentPending = pendingTask;
      queueMicrotask(() => {
        currentPending.resume(Effect.fail(new PolicyCanceledError(reason)));
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
      runEffectWithSquashedCause(
        Effect.async<A, unknown>((resume) => {
          clearPending("Debounced task replaced");
          const currentTask: PendingTask<A> = {
            task,
            resume,
          };
          pendingTask = currentTask as PendingTask<unknown>;
          timer = setTimeout(() => {
            timer = undefined;
            const current = pendingTask as PendingTask<A> | undefined;
            pendingTask = undefined;
            if (current === undefined) {
              resume(Effect.fail(new PolicyCanceledError("Debounced task missing")));
              return;
            }
            Effect.runCallback(fromTaskEffect(current.task), {
              onExit: (exit) => {
                current.resume(fromExit(exit as Exit.Exit<A, unknown>));
              },
            });
          }, durationMs);
          return Effect.sync(() => {
            if (pendingTask === currentTask) {
              pendingTask = undefined;
            }
            if (timer !== undefined) {
              clearTimeout(timer);
              timer = undefined;
            }
          });
        }),
      ),
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
    Effect.runCallback(fromTaskEffect(current.task), {
      onExit: (exit) => {
        current.resume(fromExit(exit as Exit.Exit<unknown, unknown>));
      },
    });
    timer = setTimeout(drain, durationMs);
  };

  return {
    run: <A>(task: () => A | Promise<A>) =>
      runEffectWithSquashedCause(
        Effect.async<A, unknown>((resume) => {
          if (!blocked) {
            blocked = true;
            Effect.runCallback(fromTaskEffect(task), {
              onExit: (exit) => {
                resume(fromExit(exit as Exit.Exit<A, unknown>));
              },
            });
            timer = setTimeout(drain, durationMs);
            return Effect.void;
          }
          if (queuedTask !== undefined) {
            const previousQueued = queuedTask as PendingTask<A>;
            queueMicrotask(() => {
              previousQueued.resume(
                Effect.fail(new PolicyCanceledError("Throttled task replaced")),
              );
            });
          }
          const currentTask: PendingTask<A> = {
            task,
            resume,
          };
          queuedTask = currentTask as PendingTask<unknown>;
          return Effect.sync(() => {
            if (queuedTask === currentTask) {
              queuedTask = undefined;
            }
          });
        }),
      ),
    cancel: (reason?: string) => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      blocked = false;
      if (queuedTask !== undefined) {
        const currentQueued = queuedTask;
        queueMicrotask(() => {
          currentQueued.resume(
            Effect.fail(new PolicyCanceledError(reason ?? "Throttled task canceled")),
          );
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
