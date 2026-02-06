import { useEffect, useRef, type ReactNode } from "react";
import type { AnyManagedRuntime } from "../internal/runtimeContext";
import { RuntimeContext } from "../internal/runtimeContext";
import { QueryCache } from "../query/QueryCache";
import { QueryCacheContext } from "../query/context";

export interface EffectProviderProps {
  readonly runtime: AnyManagedRuntime;
  readonly cache?: QueryCache;
  readonly children: ReactNode;
}

export const EffectProvider = ({ runtime, cache, children }: EffectProviderProps) => {
  const cacheRef = useRef<QueryCache>(cache ?? new QueryCache());
  if (cache && cacheRef.current !== cache) {
    cacheRef.current = cache;
  }

  const runtimeRef = useRef(runtime);
  const previousRuntimeRef = useRef<AnyManagedRuntime | null>(null);

  useEffect(() => {
    runtimeRef.current = runtime;
    const previous = previousRuntimeRef.current;
    if (previous !== null && previous !== runtime) {
      void previous.dispose();
    }
    previousRuntimeRef.current = runtime;
  }, [runtime]);

  useEffect(
    () => () => {
      void runtimeRef.current.dispose();
    },
    [],
  );

  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryCacheContext.Provider value={cacheRef.current}>{children}</QueryCacheContext.Provider>
    </RuntimeContext.Provider>
  );
};
