import { Cause, Effect, Exit } from "effect";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { createExternalStore } from "../internal/externalStore";
import { useRuntime } from "../provider/useRuntime";
import { useQueryCache } from "../query/context";
import type {
  MutationInvalidationTarget,
  MutationResult,
  UseMutationOptions,
  UseMutationResult,
} from "./types";

const initialResult = <A, E>(): MutationResult<A, E> => ({
  status: "initial",
  data: undefined,
  cause: undefined,
  submittedAt: null,
});

const resolveTargets = (
  target: readonly MutationInvalidationTarget[] | undefined,
): readonly MutationInvalidationTarget[] => target ?? [];

const resolveMutation = <V, A, E, R>(
  mutation: UseMutationOptions<V, A, E, R>["mutation"],
  variables: V,
) => (typeof mutation === "function" ? mutation(variables) : mutation);

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { readonly then?: unknown }).then === "function";

const fromMaybePromiseEffect = <A>(
  thunk: () => A | PromiseLike<A>,
): Effect.Effect<A, unknown, never> =>
  Effect.try({
    try: thunk,
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
  Effect.runPromise(effect.pipe(Effect.catchAllCause((cause) => Effect.fail(Cause.squash(cause)))));

export const useMutation = <V, A, E, R>(
  options: UseMutationOptions<V, A, E, R>,
): UseMutationResult<V, A, E> => {
  const runtime = useRuntime();
  const cache = useQueryCache();
  const storeRef = useRef(createExternalStore<MutationResult<A, E>>(initialResult<A, E>()));
  const handleRef = useRef<EffectRunHandle<A, E> | null>(null);
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const getSnapshot = useCallback(() => storeRef.current.getSnapshot(), []);
  const subscribe = useCallback((listener: () => void) => storeRef.current.subscribe(listener), []);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSnapshot = useCallback((next: MutationResult<A, E>) => {
    if (!mountedRef.current) {
      return;
    }
    storeRef.current.setSnapshot(next);
  }, []);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    if (handleRef.current !== null) {
      handleRef.current.cancel();
      handleRef.current = null;
    }
    setSnapshot(initialResult<A, E>());
  }, [setSnapshot]);

  const reset = useCallback(() => {
    setSnapshot(initialResult<A, E>());
  }, [setSnapshot]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (handleRef.current !== null) {
        handleRef.current.cancel();
        handleRef.current = null;
      }
    },
    [],
  );

  const mutate = useCallback(
    (variables: V): Promise<A> =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          runIdRef.current += 1;
          const runId = runIdRef.current;

          if (handleRef.current !== null) {
            handleRef.current.cancel();
            handleRef.current = null;
          }

          optionsRef.current.optimistic?.apply(variables);

          setSnapshot({
            status: "pending",
            data: storeRef.current.getSnapshot().data,
            cause: undefined,
            submittedAt: Date.now(),
          });

          const handle = runEffect(
            runtime,
            resolveMutation(optionsRef.current.mutation, variables),
          );
          handleRef.current = handle;

          const exit = yield* Effect.tryPromise({
            try: () => handle.promise,
            catch: (cause) => cause,
          });
          if (runIdRef.current !== runId) {
            return yield* Effect.fail(new Error("Mutation superseded"));
          }
          handleRef.current = null;

          if (Exit.isSuccess(exit)) {
            const result: MutationResult<A, E> = {
              status: "success",
              data: exit.value,
              cause: undefined,
              submittedAt: Date.now(),
            };
            setSnapshot(result);
            for (const target of resolveTargets(optionsRef.current.invalidate)) {
              cache.invalidate(target);
            }
            if (optionsRef.current.onSuccess) {
              yield* fromMaybePromiseEffect(() =>
                optionsRef.current.onSuccess!(exit.value, variables),
              );
            }
            if (optionsRef.current.onSettled) {
              yield* fromMaybePromiseEffect(() => optionsRef.current.onSettled!(result, variables));
            }
            return exit.value;
          }

          const cause = exit.cause as Cause.Cause<E>;
          optionsRef.current.optimistic?.rollback(variables, cause);
          const result: MutationResult<A, E> = {
            status: "failure",
            data: undefined,
            cause,
            submittedAt: Date.now(),
          };
          setSnapshot(result);
          if (optionsRef.current.onError) {
            yield* fromMaybePromiseEffect(() => optionsRef.current.onError!(cause, variables));
          }
          if (optionsRef.current.onSettled) {
            yield* fromMaybePromiseEffect(() => optionsRef.current.onSettled!(result, variables));
          }
          return yield* Effect.fail(Cause.squash(cause));
        }),
      ),
    [cache, runtime, setSnapshot],
  );

  return {
    ...snapshot,
    mutate,
    cancel,
    reset,
  };
};
