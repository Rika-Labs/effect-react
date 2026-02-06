import type { SubscriptionRef } from "effect";
import { Effect, Stream } from "effect";
import { runEffect } from "../internal/effectRunner";
import type { EffectRuntime } from "../internal/runtimeContext";

export interface RefSubscription {
  readonly unsubscribe: () => void;
}

export const subscribeToRef = <A>(
  runtime: EffectRuntime,
  ref: SubscriptionRef.SubscriptionRef<A>,
  callback: (value: A) => void,
): RefSubscription => {
  const handle = runEffect(
    runtime,
    Stream.runForEach(ref.changes, (next) => Effect.sync(() => callback(next))),
  );
  return { unsubscribe: () => handle.cancel() };
};
