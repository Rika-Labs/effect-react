import type { SubscriptionRef } from "effect";
import { Effect, Stream } from "effect";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { createExternalStore } from "../internal/externalStore";
import { useRuntime } from "../provider/useRuntime";

export interface UseComputedOptions<S> {
  readonly equals?: (left: S, right: S) => boolean;
}

const defaultEquals = <S>(left: S, right: S): boolean => Object.is(left, right);

export const useComputed = <A, S>(
  refs: readonly SubscriptionRef.SubscriptionRef<A>[],
  initials: readonly A[],
  compute: (...values: A[]) => S,
  options?: UseComputedOptions<S>,
): S => {
  const runtime = useRuntime();
  const equals = options?.equals ?? defaultEquals<S>;
  const valuesRef = useRef<A[]>([...initials]);
  const storeRef = useRef(createExternalStore<S>(compute(...initials)));
  const handlesRef = useRef<EffectRunHandle<void, unknown>[]>([]);

  const getSnapshot = useCallback(() => storeRef.current.getSnapshot(), []);
  const subscribe = useCallback((listener: () => void) => storeRef.current.subscribe(listener), []);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    for (const handle of handlesRef.current) {
      handle.cancel();
    }
    handlesRef.current = [];
    valuesRef.current = [...initials];

    const recompute = () => {
      const next = compute(...valuesRef.current);
      const prev = storeRef.current.getSnapshot();
      if (!equals(prev, next)) {
        storeRef.current.setSnapshot(next);
      }
    };

    const handles = refs.map((ref, index) => {
      const handle = runEffect(
        runtime,
        Stream.runForEach(ref.changes, (next) =>
          Effect.sync(() => {
            valuesRef.current[index] = next;
            recompute();
          }),
        ),
      );
      return handle as EffectRunHandle<void, unknown>;
    });

    handlesRef.current = handles;

    return () => {
      for (const handle of handles) {
        handle.cancel();
      }
      handlesRef.current = [];
    };
  }, [compute, equals, initials, refs, runtime]);

  return value;
};
