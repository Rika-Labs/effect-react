import { Effect, Fiber, Stream } from "effect";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useEffectRuntime } from "../react/provider";
import { Data } from "./service";
import type { QueryDefinition, QueryRunOptions, QuerySnapshot } from "./types";

const useDataService = () => {
  const runtime = useEffectRuntime();
  return useMemo(() => runtime.runSync(Data), [runtime]);
};

export interface UseQueryOptions {
  readonly enabled?: boolean;
  readonly run?: QueryRunOptions;
}

export const useQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
  options: UseQueryOptions = {},
): QuerySnapshot<Output, E> & {
  readonly refetch: () => Promise<Output>;
  readonly invalidate: () => Promise<void>;
} => {
  const runtime = useEffectRuntime();
  const data = useDataService();

  const subscribe = useCallback(
    (listener: () => void) => {
      const fiber = runtime.runFork(
        Stream.runForEach(data.snapshots, () => Effect.sync(listener)),
      );

      return () => {
        runtime.runFork(Fiber.interrupt(fiber));
      };
    },
    [data, runtime],
  );

  const getSnapshot = useCallback(
    () => runtime.runSync(data.getSnapshot(definition, input)) as QuerySnapshot<Output, E>,
    [data, definition, input, runtime],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (options.enabled === false) {
      return;
    }
    runtime.runFork(data.prefetch(definition, input));
  }, [data, definition, input, options.enabled, runtime]);

  const refetch = useCallback(
    () => runtime.runPromise(data.fetch(definition, input, { ...options.run, forceRefresh: true })),
    [data, definition, input, options.run, runtime],
  );

  const invalidate = useCallback(
    () => runtime.runPromise(data.invalidate(definition, input)),
    [data, definition, input, runtime],
  );

  return {
    ...snapshot,
    refetch,
    invalidate,
  };
};

export const useSuspenseQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
): Output => {
  const result = useQuery(definition, input);
  if (result.phase === "failure") {
    throw result.error;
  }
  if (result.phase === "success") {
    return result.data as Output;
  }
  throw result.refetch();
};
