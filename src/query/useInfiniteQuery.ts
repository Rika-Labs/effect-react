import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Effect } from "effect";
import { useRuntime } from "../provider/useRuntime";
import { useQueryCache } from "./context";
import type { QueryEntry } from "./QueryCache";
import type {
  InfiniteData,
  InfiniteQueryResult,
  QueryResult,
  UseInfiniteQueryOptions,
} from "./types";

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

  const entry = useMemo(
    () =>
      cache.ensureEntry<InfiniteData<A, P>, E>({
        key,
        ...(staleTime !== undefined ? { staleTime } : {}),
        ...(gcTime !== undefined ? { gcTime } : {}),
        ...(keyHasher !== undefined ? { keyHasher } : {}),
      }),
    [cache, gcTime, key, keyHasher, staleTime],
  );

  const getSnapshot = useCallback(() => cache.getSnapshot(entry), [cache, entry]);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribeEntry(entry, listener),
    [cache, entry],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const initialFetchHashRef = useRef<string | null>(null);

  const [fetchingDirection, setFetchingDirection] = useState<"none" | "next" | "previous">("none");

  const runInitialFetch = useCallback(async () => {
    const effect = query({ pageParam: initialPageParam });
    await cache.fetch({
      entry: entry as QueryEntry<InfiniteData<A, P>, E>,
      key,
      query: Effect.map(
        effect,
        (page): InfiniteData<A, P> => ({
          pages: [page],
          pageParams: [initialPageParam],
        }),
      ),
      runtime,
      ...(staleTime !== undefined ? { staleTime } : {}),
      ...(gcTime !== undefined ? { gcTime } : {}),
      ...(keyHasher !== undefined ? { keyHasher } : {}),
    });
  }, [cache, entry, gcTime, initialPageParam, key, keyHasher, query, runtime, staleTime]);

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

  const fetchNextPage = useCallback(async () => {
    if (!currentData || currentData.pages.length === 0) return;
    const lastPage = currentData.pages[currentData.pages.length - 1] as A | undefined;
    if (lastPage === undefined) return;
    const nextParam = getNextPageParam(lastPage, currentData.pages);
    if (nextParam === undefined || nextParam === null) return;

    setFetchingDirection("next");
    const effect = query({ pageParam: nextParam });
    await cache.fetch({
      entry: entry as QueryEntry<InfiniteData<A, P>, E>,
      key,
      query: Effect.map(
        effect,
        (page): InfiniteData<A, P> => ({
          pages: [...currentData.pages, page],
          pageParams: [...currentData.pageParams, nextParam],
        }),
      ),
      runtime,
      force: true,
      ...(staleTime !== undefined ? { staleTime } : {}),
      ...(gcTime !== undefined ? { gcTime } : {}),
      ...(keyHasher !== undefined ? { keyHasher } : {}),
    });
    setFetchingDirection("none");
  }, [
    cache,
    currentData,
    entry,
    gcTime,
    getNextPageParam,
    key,
    keyHasher,
    query,
    runtime,
    staleTime,
  ]);

  const fetchPreviousPage = useCallback(async () => {
    if (!currentData || currentData.pages.length === 0) return;
    if (!getPreviousPageParam) return;
    const firstPage = currentData.pages[0] as A | undefined;
    if (firstPage === undefined) return;
    const prevParam = getPreviousPageParam(firstPage, currentData.pages);
    if (prevParam === undefined || prevParam === null) return;

    setFetchingDirection("previous");
    const effect = query({ pageParam: prevParam });
    await cache.fetch({
      entry: entry as QueryEntry<InfiniteData<A, P>, E>,
      key,
      query: Effect.map(
        effect,
        (page): InfiniteData<A, P> => ({
          pages: [page, ...currentData.pages],
          pageParams: [prevParam, ...currentData.pageParams],
        }),
      ),
      runtime,
      force: true,
      ...(staleTime !== undefined ? { staleTime } : {}),
      ...(gcTime !== undefined ? { gcTime } : {}),
      ...(keyHasher !== undefined ? { keyHasher } : {}),
    });
    setFetchingDirection("none");
  }, [
    cache,
    currentData,
    entry,
    gcTime,
    getPreviousPageParam,
    key,
    keyHasher,
    query,
    runtime,
    staleTime,
  ]);

  const refetch = useCallback(async () => {
    await runInitialFetch();
  }, [runInitialFetch]);

  const invalidate = useCallback(() => {
    cache.invalidate(key, keyHasher ?? cache.keyHasher);
  }, [cache, key, keyHasher]);

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
