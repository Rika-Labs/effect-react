import { Effect, type Exit } from "effect";
import type { EffectRuntime } from "./runtimeContext";

export interface EffectRunHandle<A, E> {
  readonly promise: Promise<Exit.Exit<A, E>>;
  readonly signal: AbortSignal;
  readonly cancel: () => void;
}

export const runEffect = <A, E, R>(
  runtime: EffectRuntime,
  effect: Effect.Effect<A, E, R>,
): EffectRunHandle<A, E> => {
  const controller = new AbortController();
  let canceled = false;
  const scoped = Effect.scoped(effect) as unknown as Effect.Effect<A, E, never>;
  const promise = runtime.runPromiseExit(scoped, {
    signal: controller.signal,
  } as { readonly signal: AbortSignal }) as Promise<Exit.Exit<A, E>>;
  return {
    promise,
    signal: controller.signal,
    cancel: () => {
      if (canceled) {
        return;
      }
      canceled = true;
      controller.abort();
    },
  };
};
