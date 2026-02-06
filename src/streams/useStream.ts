import type { Cause } from "effect";
import { Effect, Stream } from "effect";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { createExternalStore } from "../internal/externalStore";
import { useRuntime } from "../provider/useRuntime";

export interface UseStreamOptions<A, E, S = A> {
  readonly stream: Stream.Stream<A, E, never>;
  readonly initial: S;
  readonly select?: (value: A) => S;
  readonly equals?: (left: S, right: S) => boolean;
}

export interface UseStreamResult<S, E> {
  readonly value: S;
  readonly error: Cause.Cause<E> | undefined;
  readonly done: boolean;
}

interface StreamState<S, E> {
  readonly value: S;
  readonly error: Cause.Cause<E> | undefined;
  readonly done: boolean;
}

const defaultEquals = <S>(left: S, right: S): boolean => Object.is(left, right);

export const useStream = <A, E, S = A>(
  options: UseStreamOptions<A, E, S>,
): UseStreamResult<S, E> => {
  const runtime = useRuntime();
  const { stream, initial, select, equals = defaultEquals<S> } = options;

  const store = useMemo(
    () =>
      createExternalStore<StreamState<S, E>>({
        value: initial,
        error: undefined,
        done: false,
      }),
    [stream, initial],
  );
  const handleRef = useRef<EffectRunHandle<void, E> | null>(null);

  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    handleRef.current?.cancel();

    const effect = Effect.matchCauseEffect(
      Stream.runForEach(stream, (next) =>
        Effect.sync(() => {
          const selected = select ? select(next) : (next as unknown as S);
          const prev = store.getSnapshot();
          if (!equals(prev.value, selected)) {
            store.setSnapshot({
              ...prev,
              value: selected,
            });
          }
        }),
      ),
      {
        onFailure: (cause) =>
          Effect.sync(() => {
            const prev = store.getSnapshot();
            store.setSnapshot({
              ...prev,
              error: cause,
              done: true,
            });
          }),
        onSuccess: () =>
          Effect.sync(() => {
            const prev = store.getSnapshot();
            if (!prev.done) {
              store.setSnapshot({
                ...prev,
                done: true,
              });
            }
          }),
      },
    );

    const handle = runEffect(runtime, effect);
    handleRef.current = handle as EffectRunHandle<void, E>;

    return () => {
      handle.cancel();
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
    };
  }, [equals, runtime, select, store, stream]);

  return state;
};
