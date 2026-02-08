import { Effect } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useQuery as useDataQuery,
  useSuspenseQuery as useDataSuspenseQuery,
  type UseQueryOptions,
} from "../data";
import { Data } from "../data";
import { useEffectRuntime } from "../react/provider";
import type {
  QueryDefinition,
  QueryError,
  QueryPhase,
  QueryRunOptions,
} from "./types";

interface InfiniteQueryEntry<Output, PageParam> {
  readonly key: string;
  readonly pageParam: PageParam;
  readonly data: Output;
}

const upsertInfiniteEntry = <Output, PageParam>(
  entries: readonly InfiniteQueryEntry<Output, PageParam>[],
  nextEntry: InfiniteQueryEntry<Output, PageParam>,
): readonly InfiniteQueryEntry<Output, PageParam>[] => {
  const index = entries.findIndex((entry) => entry.key === nextEntry.key);
  if (index < 0) {
    return [...entries, nextEntry];
  }
  const next = [...entries];
  next[index] = nextEntry;
  return next;
};

const useDataService = () => {
  const runtime = useEffectRuntime();
  return useMemo(() => runtime.runSync(Data), [runtime]);
};

export { type UseQueryOptions };

export const useQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
  options: UseQueryOptions = {},
) => useDataQuery(definition, input, options);

export const useSuspenseQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
): Output => useDataSuspenseQuery(definition, input);

export interface UseInfiniteQueryOptions<Input, Output, PageParam> {
  readonly initialPageParam: PageParam;
  readonly getInput: (pageParam: PageParam) => Input;
  readonly getNextPageParam: (
    lastPage: Output,
    allPages: readonly Output[],
    lastPageParam: PageParam,
    allPageParams: readonly PageParam[],
  ) => PageParam | undefined;
  readonly enabled?: boolean;
  readonly run?: QueryRunOptions;
}

export interface UseInfiniteQueryResult<Output, E, PageParam> {
  readonly phase: QueryPhase;
  readonly pages: readonly Output[];
  readonly pageParams: readonly PageParam[];
  readonly error: QueryError<E> | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<Output | undefined>;
  readonly refetch: () => Promise<readonly Output[]>;
  readonly invalidate: () => Promise<void>;
}

export const useInfiniteQuery = <Name extends string, Input, Output, E, PageParam>(
  definition: QueryDefinition<Name, Input, Output, E>,
  options: UseInfiniteQueryOptions<Input, Output, PageParam>,
): UseInfiniteQueryResult<Output, E, PageParam> => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const initialPageParam = options.initialPageParam;
  const enabled = options.enabled;
  const run = options.run;

  const getInput = useCallback(
    (pageParam: PageParam): Input => optionsRef.current.getInput(pageParam),
    [],
  );

  const getNextPageParam = useCallback(
    (
      lastPage: Output,
      allPages: readonly Output[],
      lastPageParam: PageParam,
      allPageParams: readonly PageParam[],
    ): PageParam | undefined =>
      optionsRef.current.getNextPageParam(lastPage, allPages, lastPageParam, allPageParams),
    [],
  );

  const runtime = useEffectRuntime();
  const data = useDataService();
  const [initialInput, setInitialInput] = useState<Input>(() =>
    getInput(initialPageParam),
  );
  const [entries, setEntries] = useState<readonly InfiniteQueryEntry<Output, PageParam>[]>([]);
  const [error, setError] = useState<QueryError<E> | undefined>(undefined);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const initialQuery = useQuery(
    definition,
    initialInput,
    {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(run !== undefined ? { run } : {}),
    },
  );

  useEffect(() => {
    setInitialInput(getInput(initialPageParam));
    setEntries([]);
    setError(undefined);
    setIsFetchingNextPage(false);
  }, [definition, getInput, initialPageParam]);

  useEffect(() => {
    if (initialQuery.phase === "success") {
      setEntries((current) =>
        upsertInfiniteEntry(current, {
          key: initialQuery.key,
          pageParam: initialPageParam,
          data: initialQuery.data as Output,
        }),
      );
      setError(undefined);
      return;
    }
    if (initialQuery.phase === "failure") {
      setError(initialQuery.error as QueryError<E>);
    }
  }, [
    initialQuery.data,
    initialQuery.error,
    initialQuery.key,
    initialQuery.phase,
    initialPageParam,
  ]);

  const pages = useMemo(() => entries.map((entry) => entry.data), [entries]);
  const pageParams = useMemo(() => entries.map((entry) => entry.pageParam), [entries]);

  const resolveNextPageParam = useCallback((): PageParam | undefined => {
    const lastEntry = entries[entries.length - 1];
    if (lastEntry !== undefined) {
      return getNextPageParam(lastEntry.data, pages, lastEntry.pageParam, pageParams);
    }
    if (initialQuery.phase !== "success") {
      return undefined;
    }
    const initialPage = initialQuery.data as Output;
    return getNextPageParam(
      initialPage,
      [initialPage],
      initialPageParam,
      [initialPageParam],
    );
  }, [
    entries,
    getNextPageParam,
    initialPageParam,
    initialQuery.data,
    initialQuery.phase,
    pageParams,
    pages,
  ]);

  const fetchNextPage = useCallback((): Promise<Output | undefined> => {
    const nextPageParam = resolveNextPageParam();
    if (nextPageParam === undefined) {
      return runtime.runPromise(Effect.succeed<Output | undefined>(undefined));
    }

    setIsFetchingNextPage(true);
    setError(undefined);

    const input = getInput(nextPageParam);
    const program = Effect.gen(function* () {
      const value = yield* data.fetch(definition, input, run);
      const snapshot = yield* data.getSnapshot(definition, input);
      return {
        key: snapshot.key,
        pageParam: nextPageParam,
        value,
      };
    });

    return runtime.runPromise(program).then(
      ({ key, pageParam, value }) => {
        setEntries((current) =>
          upsertInfiniteEntry(current, {
            key,
            pageParam,
            data: value,
          }),
        );
        setIsFetchingNextPage(false);
        return value;
      },
      (cause: unknown) => {
        setIsFetchingNextPage(false);
        const resolved = cause as QueryError<E>;
        setError(resolved);
        return runtime.runPromise(Effect.fail(resolved));
      },
    );
  }, [data, definition, getInput, resolveNextPageParam, run, runtime]);

  const refetch = useCallback((): Promise<readonly Output[]> => {
    const targets = pageParams.length === 0
      ? [initialPageParam]
      : pageParams;

    setError(undefined);

    const program = Effect.forEach(
      targets,
      (pageParam) => {
        const input = getInput(pageParam);
        return Effect.gen(function* () {
          const value = yield* data.fetch(definition, input, {
            ...run,
            forceRefresh: true,
          });
          const snapshot = yield* data.getSnapshot(definition, input);
          return {
            key: snapshot.key,
            pageParam,
            data: value,
          } satisfies InfiniteQueryEntry<Output, PageParam>;
        });
      },
      {
        concurrency: 1,
        discard: false,
      },
    );

    return runtime.runPromise(program).then(
      (fetchedEntries) => {
        setEntries(fetchedEntries);
        return fetchedEntries.map((entry) => entry.data);
      },
      (cause: unknown) => {
        const resolved = cause as QueryError<E>;
        setError(resolved);
        return runtime.runPromise(Effect.fail(resolved));
      },
    );
  }, [data, definition, getInput, initialPageParam, pageParams, run, runtime]);

  const invalidate = useCallback((): Promise<void> => {
    const targets = pageParams.length === 0
      ? [initialPageParam]
      : pageParams;

    const program = Effect.forEach(
      targets,
      (pageParam) => data.invalidate(definition, getInput(pageParam)),
      {
        concurrency: 1,
        discard: true,
      },
    );

    return runtime.runPromise(program).then(
      () => {
        setEntries([]);
        setError(undefined);
        setIsFetchingNextPage(false);
        return undefined;
      },
      (cause: unknown) => {
        const resolved = cause as QueryError<E>;
        setError(resolved);
        return runtime.runPromise(Effect.fail(resolved));
      },
    );
  }, [data, definition, getInput, initialPageParam, pageParams, runtime]);

  const resolvedError = error ??
    (initialQuery.phase === "failure" ? (initialQuery.error as QueryError<E>) : undefined);

  const phase: QueryPhase = resolvedError !== undefined
    ? "failure"
    : entries.length > 0
      ? "success"
      : initialQuery.phase;

  return {
    phase,
    pages,
    pageParams,
    error: resolvedError,
    hasNextPage: resolveNextPageParam() !== undefined,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    invalidate,
  };
};
