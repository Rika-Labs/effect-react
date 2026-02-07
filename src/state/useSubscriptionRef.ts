import { Cause, Effect, Exit, Stream, SubscriptionRef } from "effect";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { createExternalStore } from "../internal/externalStore";
import { useRuntime } from "../provider/useRuntime";
import type { StateMiddleware } from "./middleware";

export interface UseSubscriptionRefOptions<A, S = A> {
  readonly ref: SubscriptionRef.SubscriptionRef<A>;
  readonly initial: A;
  readonly select?: (value: A) => S;
  readonly equals?: (left: S, right: S) => boolean;
  readonly middlewares?: readonly StateMiddleware<A>[];
}

export interface UseSubscriptionRefResult<A, S> {
  readonly value: S;
  readonly set: (value: A) => Promise<void>;
  readonly update: (updater: (value: A) => A) => Promise<void>;
}

const defaultEquals = <S>(left: S, right: S): boolean => Object.is(left, right);

const asSelected = <A, S>(value: A, select: ((value: A) => S) | undefined): S =>
  select ? select(value) : (value as unknown as S);

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

export const useSubscriptionRef = <A, S = A>(
  options: UseSubscriptionRefOptions<A, S>,
): UseSubscriptionRefResult<A, S> => {
  const runtime = useRuntime();
  const { ref, initial, select, equals = defaultEquals<S>, middlewares } = options;
  const storeRef = useRef(createExternalStore<S>(asSelected(initial, select)));
  const subscriptionRef = useRef<EffectRunHandle<void, unknown> | null>(null);

  const getSnapshot = useCallback(() => storeRef.current.getSnapshot(), []);
  const subscribe = useCallback((listener: () => void) => storeRef.current.subscribe(listener), []);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const pushSelected = useCallback(
    (next: A) => {
      const selected = asSelected(next, select);
      const previous = storeRef.current.getSnapshot();
      if (equals(previous, selected)) {
        return;
      }
      storeRef.current.setSnapshot(selected);
    },
    [equals, select],
  );

  useEffect(() => {
    subscriptionRef.current?.cancel();
    const handle = runEffect(
      runtime,
      Stream.runForEach(ref.changes, (next) =>
        Effect.sync(() => {
          pushSelected(next);
        }),
      ),
    );
    subscriptionRef.current = handle as EffectRunHandle<void, unknown>;

    return () => {
      handle.cancel();
      if (subscriptionRef.current === handle) {
        subscriptionRef.current = null;
      }
    };
  }, [pushSelected, ref, runtime]);

  const runMiddlewares = useCallback(
    (next: A, prev: A) => {
      if (middlewares) {
        for (const mw of middlewares) {
          mw.onSet?.(next, prev);
        }
      }
    },
    [middlewares],
  );

  const set = useCallback(
    (next: A) =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          const prev = storeRef.current.getSnapshot() as unknown as A;
          const handle = runEffect(runtime, SubscriptionRef.set(ref, next));
          const exit = yield* Effect.tryPromise({
            try: () => handle.promise,
            catch: (cause) => cause,
          });
          if (Exit.isFailure(exit)) {
            yield* Effect.fail(new Error("SubscriptionRef set failed"));
          }
          yield* Effect.sync(() => {
            pushSelected(next);
            runMiddlewares(next, prev);
          });
        }),
      ),
    [pushSelected, ref, runMiddlewares, runtime],
  );

  const update = useCallback(
    (updater: (value: A) => A) =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          const prev = storeRef.current.getSnapshot() as unknown as A;
          const handle = runEffect(runtime, SubscriptionRef.update(ref, updater));
          const exit = yield* Effect.tryPromise({
            try: () => handle.promise,
            catch: (cause) => cause,
          });
          if (Exit.isFailure(exit)) {
            yield* Effect.fail(new Error("SubscriptionRef update failed"));
          }
          const readHandle = runEffect(runtime, SubscriptionRef.get(ref));
          const readExit = yield* Effect.tryPromise({
            try: () => readHandle.promise,
            catch: (cause) => cause,
          });
          const currentValue = yield* Exit.isSuccess(readExit)
            ? Effect.succeed(readExit.value)
            : Effect.fail(new Error("SubscriptionRef get failed"));
          yield* Effect.sync(() => {
            pushSelected(currentValue);
            runMiddlewares(currentValue, prev);
          });
        }),
      ),
    [pushSelected, ref, runMiddlewares, runtime],
  );

  return {
    value,
    set,
    update,
  };
};
