import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Cause, Effect } from "effect";
import { useRuntime } from "../provider/useRuntime";
import { useQueryCache } from "./context";
import type { QueryEntry } from "./QueryCache";
import type {
  InfiniteData,
  InfiniteQueryResult,
  QueryResult,
  UseInfiniteQueryOptions,
} from "./types";

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.catchAllCause((cause) => Effect.fail(Cause.squash(cause)))));

export const useInfiniteQuery = <A, E, R, P = unknown>(
  options: UseInfiniteQueryOptions<A, E, R, P>,
): InfiniteQueryResult<A, E, P> => {
  const runtime = useRuntime();
  const cache = useQueryCache();
  const {
    key,
    query,
    getNextPageParam,
    getPreviousPageParam,
    initialPageParam,
    enabled = true,
    staleTime,
    gcTime,
    keyHasher,
  } = options;

  const effectiveKeyHasher = keyHasher ?? cache.keyHasher;
  const keyHash = effectiveKeyHasher(key);

  const stableKey = useRef(key);
  if (effectiveKeyHasher(stableKey.current) !== keyHash) {
    stableKey.current = key;
  }

  const entry = useMemo(() => {
    void keyHash;
    return cache.ensureEntry<InfiniteData<A, P>, E>({
      key: stableKey.current,
      ...(staleTime !== undefined ? { staleTime } : {}),
      ...(gcTime !== undefined ? { gcTime } : {}),
      ...(keyHasher !== undefined ? { keyHasher } : {}),
    });
  }, [cache, gcTime, keyHash, keyHasher, staleTime]);

  const getSnapshot = useCallback(() => cache.getSnapshot(entry), [cache, entry]);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribeEntry(entry, listener),
    [cache, entry],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const initialFetchHashRef = useRef<string | null>(null);

  const [fetchingDirection, setFetchingDirection] = useState<"none" | "next" | "previous">("none");

  const runInitialFetch = useCallback(
    (): Promise<void> =>
      runEffectWithSquashedCause(
        cache
          .fetchEffect({
            entry: entry as QueryEntry<InfiniteData<A, P>, E>,
            key: stableKey.current,
            query: Effect.map(
              query({ pageParam: initialPageParam }),
              (page): InfiniteData<A, P> => ({
                pages: [page],
                pageParams: [initialPageParam],
              }),
            ),
            runtime,
            ...(staleTime !== undefined ? { staleTime } : {}),
            ...(gcTime !== undefined ? { gcTime } : {}),
            ...(keyHasher !== undefined ? { keyHasher } : {}),
          })
          .pipe(Effect.asVoid),
      ),
    [cache, entry, gcTime, initialPageParam, keyHasher, query, runtime, staleTime],
  );

  useEffect(() => {
    if (!enabled) return;
    if (initialFetchHashRef.current === entry.hash) return;
    initialFetchHashRef.current = entry.hash;
    if (!cache.shouldFetch(entry, { includeStale: true })) return;
    void runInitialFetch();
  }, [cache, enabled, entry, runInitialFetch]);

  const currentData = snapshot.data;

  const hasNextPage = useMemo(() => {
    if (!currentData || currentData.pages.length === 0) return false;
    const lastPage = currentData.pages[currentData.pages.length - 1] as A | undefined;
    if (lastPage === undefined) return false;
    const param = getNextPageParam(lastPage, currentData.pages);
    return param !== undefined && param !== null;
  }, [currentData, getNextPageParam]);

  const hasPreviousPage = useMemo(() => {
    if (!currentData || currentData.pages.length === 0) return false;
    if (!getPreviousPageParam) return false;
    const firstPage = currentData.pages[0] as A | undefined;
    if (firstPage === undefined) return false;
    const param = getPreviousPageParam(firstPage, currentData.pages);
    return param !== undefined && param !== null;
  }, [currentData, getPreviousPageParam]);

  const fetchNextPage = useCallback(
    (): Promise<void> =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          const freshData = cache.getSnapshot(entry).data as InfiniteData<A, P> | undefined;
          if (!freshData || freshData.pages.length === 0) {
            return;
          }
          const lastPage = freshData.pages[freshData.pages.length - 1] as A | undefined;
          if (lastPage === undefined) {
            return;
          }
          const nextParam = getNextPageParam(lastPage, freshData.pages);
          if (nextParam === undefined || nextParam === null) {
            return;
          }

          yield* Effect.sync(() => {
            setFetchingDirection("next");
          });
          yield* cache.fetchEffect({
            entry: entry as QueryEntry<InfiniteData<A, P>, E>,
            key: stableKey.current,
            query: Effect.flatMap(query({ pageParam: nextParam }), (page) =>
              Effect.sync((): InfiniteData<A, P> => {
                const latest = cache.getSnapshot(entry).data as InfiniteData<A, P> | undefined;
                const pages = latest?.pages ?? freshData.pages;
                const pageParams = latest?.pageParams ?? freshData.pageParams;
                return {
                  pages: [...pages, page],
                  pageParams: [...pageParams, nextParam],
                };
              }),
            ),
            runtime,
            force: true,
            ...(staleTime !== undefined ? { staleTime } : {}),
            ...(gcTime !== undefined ? { gcTime } : {}),
            ...(keyHasher !== undefined ? { keyHasher } : {}),
          });
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              setFetchingDirection("none");
            }),
          ),
          Effect.asVoid,
        ),
      ),
    [cache, entry, gcTime, getNextPageParam, keyHasher, query, runtime, staleTime],
  );

  const fetchPreviousPage = useCallback(
    (): Promise<void> =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          const freshData = cache.getSnapshot(entry).data as InfiniteData<A, P> | undefined;
          if (!freshData || freshData.pages.length === 0) {
            return;
          }
          if (!getPreviousPageParam) {
            return;
          }
          const firstPage = freshData.pages[0] as A | undefined;
          if (firstPage === undefined) {
            return;
          }
          const prevParam = getPreviousPageParam(firstPage, freshData.pages);
          if (prevParam === undefined || prevParam === null) {
            return;
          }

          yield* Effect.sync(() => {
            setFetchingDirection("previous");
          });
          yield* cache.fetchEffect({
            entry: entry as QueryEntry<InfiniteData<A, P>, E>,
            key: stableKey.current,
            query: Effect.flatMap(query({ pageParam: prevParam }), (page) =>
              Effect.sync((): InfiniteData<A, P> => {
                const latest = cache.getSnapshot(entry).data as InfiniteData<A, P> | undefined;
                const pages = latest?.pages ?? freshData.pages;
                const pageParams = latest?.pageParams ?? freshData.pageParams;
                return {
                  pages: [page, ...pages],
                  pageParams: [prevParam, ...pageParams],
                };
              }),
            ),
            runtime,
            force: true,
            ...(staleTime !== undefined ? { staleTime } : {}),
            ...(gcTime !== undefined ? { gcTime } : {}),
            ...(keyHasher !== undefined ? { keyHasher } : {}),
          });
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              setFetchingDirection("none");
            }),
          ),
          Effect.asVoid,
        ),
      ),
    [cache, entry, gcTime, getPreviousPageParam, keyHasher, query, runtime, staleTime],
  );

  const refetch = useCallback(() => runInitialFetch(), [runInitialFetch]);

  const invalidate = useCallback(() => {
    cache.invalidate(stableKey.current, effectiveKeyHasher);
  }, [cache, effectiveKeyHasher]);

  const isFetching = snapshot.status === "loading" || snapshot.status === "refreshing";

  const mappedSnapshot = useMemo<QueryResult<InfiniteData<A, P>, E>>(
    () => ({
      ...snapshot,
      isFetching,
    }),
    [snapshot, isFetching],
  );

  return {
    ...mappedSnapshot,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage: isFetching && fetchingDirection === "next",
    isFetchingPreviousPage: isFetching && fetchingDirection === "previous",
    fetchNextPage,
    fetchPreviousPage,
    refetch,
    invalidate,
  };
};
