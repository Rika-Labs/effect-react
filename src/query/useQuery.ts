import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Cause, Effect } from "effect";
import { useRuntime } from "../provider/useRuntime";
import { useQueryCache } from "./context";
import { onWindowFocus, onWindowReconnect } from "./focus";
import type { QueryResult, UseQueryOptions, UseQueryResult } from "./types";

const resolveQueryEffect = <A, E, R>(
  query: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> => (typeof query === "function" ? query() : query);

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.catchAllCause((cause) => Effect.fail(Cause.squash(cause)))));

export const useQuery = <A, E, R, S = A>(
  options: UseQueryOptions<A, E, R, S>,
): UseQueryResult<S, E> => {
  const runtime = useRuntime();
  const cache = useQueryCache();
  const {
    key,
    query,
    enabled = true,
    staleTime,
    gcTime,
    initialData,
    placeholderData,
    select,
    keepPreviousData = false,
    refetchOnWindowFocus = true,
    refetchOnReconnect = true,
    keyHasher,
  } = options;

  const entry = useMemo(
    () =>
      cache.ensureEntry<A, E>({
        key,
        ...(staleTime !== undefined ? { staleTime } : {}),
        ...(gcTime !== undefined ? { gcTime } : {}),
        ...(initialData !== undefined ? { initialData } : {}),
        ...(keyHasher !== undefined ? { keyHasher } : {}),
      }),
    [cache, gcTime, initialData, key, keyHasher, staleTime],
  );

  const getSnapshot = useCallback(() => cache.getSnapshot(entry), [cache, entry]);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribeEntry(entry, listener),
    [cache, entry],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const initialFetchHashRef = useRef<string | null>(null);

  const runFetch = useCallback(
    (force = false): Promise<void> =>
      runEffectWithSquashedCause(
        cache
          .fetchEffect({
            entry,
            key,
            query: resolveQueryEffect(query),
            runtime,
            force,
            ...(staleTime !== undefined ? { staleTime } : {}),
            ...(gcTime !== undefined ? { gcTime } : {}),
            ...(keyHasher !== undefined ? { keyHasher } : {}),
            ...(options.structuralSharing !== undefined
              ? { structuralSharing: options.structuralSharing }
              : {}),
          })
          .pipe(Effect.asVoid),
      ),
    [cache, entry, gcTime, key, keyHasher, options.structuralSharing, query, runtime, staleTime],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (initialFetchHashRef.current === entry.hash) {
      return;
    }
    initialFetchHashRef.current = entry.hash;
    if (!cache.shouldFetch(entry, { includeStale: true })) {
      return;
    }
    void runFetch(false);
  }, [cache, enabled, entry, runFetch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const clearFocus = onWindowFocus(() => {
      if (refetchOnWindowFocus && cache.isStale(entry)) {
        void runFetch(false);
      }
    });
    const clearOnline = onWindowReconnect(() => {
      if (refetchOnReconnect && cache.isStale(entry)) {
        void runFetch(false);
      }
    });
    return () => {
      clearFocus();
      clearOnline();
    };
  }, [cache, enabled, entry, refetchOnReconnect, refetchOnWindowFocus, runFetch]);

  const selectedData = useMemo<S | undefined>(() => {
    if (snapshot.data === undefined) {
      return undefined;
    }
    return select ? select(snapshot.data) : (snapshot.data as unknown as S);
  }, [select, snapshot.data]);

  const previousDataRef = useRef<S | undefined>(undefined);
  if (selectedData !== undefined) {
    previousDataRef.current = selectedData;
  }

  let data = selectedData;
  if (data === undefined) {
    if (keepPreviousData && previousDataRef.current !== undefined) {
      data = previousDataRef.current;
    } else if (placeholderData !== undefined) {
      data = placeholderData;
    }
  }

  const usePlaceholderSurface =
    placeholderData !== undefined &&
    data === placeholderData &&
    snapshot.data === undefined &&
    (snapshot.status === "initial" || snapshot.status === "loading");

  const mappedSnapshot = useMemo<QueryResult<S, E>>(
    () => ({
      ...snapshot,
      status: usePlaceholderSurface ? "success" : snapshot.status,
      cause: usePlaceholderSurface ? undefined : snapshot.cause,
      data,
      isStale: usePlaceholderSurface ? true : snapshot.isStale,
      isFetching:
        snapshot.status === "loading" || snapshot.status === "refreshing" || usePlaceholderSurface,
    }),
    [data, snapshot, usePlaceholderSurface],
  );

  const refetch = useCallback(() => runFetch(true), [runFetch]);

  const invalidate = useCallback(() => {
    cache.invalidate(key, keyHasher ?? cache.keyHasher);
  }, [cache, key, keyHasher]);

  return {
    ...mappedSnapshot,
    refetch,
    invalidate,
  };
};
