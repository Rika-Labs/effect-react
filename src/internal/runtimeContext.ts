import { createContext, useContext } from "react";
import type { Effect, Exit } from "effect";

export interface EffectRuntime {
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<Exit.Exit<A, E>>;
  readonly dispose: () => Promise<void>;
}

export type AnyManagedRuntime = EffectRuntime;

export const RuntimeContext = createContext<AnyManagedRuntime | null>(null);

export const useRuntimeContext = (): AnyManagedRuntime => {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error("Missing EffectProvider runtime context");
  }
  return runtime;
};
