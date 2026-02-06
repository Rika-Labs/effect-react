import { Exit } from "effect";
import type { Cause } from "effect";
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

export const useMutation = <V, A, E, R>(
  options: UseMutationOptions<V, A, E, R>,
): UseMutationResult<V, A, E> => {
  const runtime = useRuntime();
  const cache = useQueryCache();
  const storeRef = useRef(createExternalStore<MutationResult<A, E>>(initialResult<A, E>()));
  const handleRef = useRef<EffectRunHandle<A, E> | null>(null);
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

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
    async (variables: V) => {
      runIdRef.current += 1;
      const runId = runIdRef.current;

      if (handleRef.current !== null) {
        handleRef.current.cancel();
        handleRef.current = null;
      }

      options.optimistic?.apply(variables);

      setSnapshot({
        status: "pending",
        data: storeRef.current.getSnapshot().data,
        cause: undefined,
        submittedAt: Date.now(),
      });

      const handle = runEffect(runtime, resolveMutation(options.mutation, variables));
      handleRef.current = handle;

      const exit = await handle.promise;
      if (runIdRef.current !== runId) {
        return exit;
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
        for (const target of resolveTargets(options.invalidate)) {
          cache.invalidate(target);
        }
        if (options.onSuccess) {
          await options.onSuccess(exit.value, variables);
        }
        if (options.onSettled) {
          await options.onSettled(result, variables);
        }
        return exit;
      }

      const cause = exit.cause as Cause.Cause<E>;
      options.optimistic?.rollback(variables, cause);
      const result: MutationResult<A, E> = {
        status: "failure",
        data: undefined,
        cause,
        submittedAt: Date.now(),
      };
      setSnapshot(result);
      if (options.onError) {
        await options.onError(cause, variables);
      }
      if (options.onSettled) {
        await options.onSettled(result, variables);
      }
      return exit;
    },
    [cache, options, runtime, setSnapshot],
  );

  return {
    ...snapshot,
    mutate,
    cancel,
    reset,
  };
};
