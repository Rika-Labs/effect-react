import { Effect, Exit, Stream, SubscriptionRef } from "effect";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { createExternalStore } from "../internal/externalStore";
import { useRuntime } from "../provider/useRuntime";
import type { StateMiddleware } from "./middleware";

export interface UseLocalSubscriptionRefOptions<A, S = A> {
  readonly initial: A;
  readonly select?: (value: A) => S;
  readonly equals?: (left: S, right: S) => boolean;
  readonly middlewares?: readonly StateMiddleware<A>[];
}

export interface UseLocalSubscriptionRefResult<A, S> {
  readonly value: S;
  readonly ready: boolean;
  readonly ref: SubscriptionRef.SubscriptionRef<A> | null;
  readonly set: (value: A) => Promise<void>;
  readonly update: (updater: (value: A) => A) => Promise<void>;
}

const defaultEquals = <S>(left: S, right: S): boolean => Object.is(left, right);

const asSelected = <A, S>(value: A, select: ((value: A) => S) | undefined): S =>
  select ? select(value) : (value as unknown as S);

export const useLocalSubscriptionRef = <A, S = A>(
  options: UseLocalSubscriptionRefOptions<A, S>,
): UseLocalSubscriptionRefResult<A, S> => {
  const runtime = useRuntime();
  const { initial, select, equals = defaultEquals<S>, middlewares } = options;
  const storeRef = useRef(createExternalStore<S>(asSelected(initial, select)));
  const refRef = useRef<SubscriptionRef.SubscriptionRef<A> | null>(null);
  const createHandleRef = useRef<EffectRunHandle<
    SubscriptionRef.SubscriptionRef<A>,
    unknown
  > | null>(null);
  const subscribeHandleRef = useRef<EffectRunHandle<void, unknown> | null>(null);
  const [ready, setReady] = useState(false);

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
    pushSelected(initial);
  }, [initial, pushSelected]);

  useEffect(() => {
    let active = true;
    if (refRef.current !== null) {
      return () => {
        active = false;
      };
    }

    const handle = runEffect(runtime, SubscriptionRef.make(initial));
    createHandleRef.current = handle as EffectRunHandle<
      SubscriptionRef.SubscriptionRef<A>,
      unknown
    >;

    void handle.promise.then((exit) => {
      if (!active || !Exit.isSuccess(exit)) {
        return undefined;
      }
      refRef.current = exit.value;
      setReady(true);
      return undefined;
    });

    return () => {
      active = false;
      handle.cancel();
    };
  }, [initial, runtime]);

  useEffect(() => {
    if (!ready || refRef.current === null) {
      return;
    }
    subscribeHandleRef.current?.cancel();

    const handle = runEffect(
      runtime,
      Stream.runForEach(refRef.current.changes, (next) =>
        Effect.sync(() => {
          pushSelected(next);
        }),
      ),
    );
    subscribeHandleRef.current = handle as EffectRunHandle<void, unknown>;

    return () => {
      handle.cancel();
      if (subscribeHandleRef.current === handle) {
        subscribeHandleRef.current = null;
      }
    };
  }, [pushSelected, ready, runtime]);

  useEffect(
    () => () => {
      createHandleRef.current?.cancel();
      subscribeHandleRef.current?.cancel();
      createHandleRef.current = null;
      subscribeHandleRef.current = null;
    },
    [],
  );

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
    async (next: A) => {
      const ref = refRef.current;
      if (ref === null) {
        return;
      }
      const prev = storeRef.current.getSnapshot() as unknown as A;
      const handle = runEffect(runtime, SubscriptionRef.set(ref, next));
      const exit = await handle.promise;
      if (Exit.isFailure(exit)) {
        throw new Error("Local SubscriptionRef set failed");
      }
      pushSelected(next);
      runMiddlewares(next, prev);
    },
    [pushSelected, runMiddlewares, runtime],
  );

  const update = useCallback(
    async (updater: (value: A) => A) => {
      const ref = refRef.current;
      if (ref === null) {
        return;
      }
      const prev = storeRef.current.getSnapshot() as unknown as A;
      const handle = runEffect(runtime, SubscriptionRef.update(ref, updater));
      const exit = await handle.promise;
      if (Exit.isFailure(exit)) {
        throw new Error("Local SubscriptionRef update failed");
      }
      const readHandle = runEffect(runtime, SubscriptionRef.get(ref));
      const readExit = await readHandle.promise;
      if (Exit.isFailure(readExit)) {
        throw new Error("Local SubscriptionRef get failed");
      }
      pushSelected(readExit.value);
      runMiddlewares(readExit.value, prev);
    },
    [pushSelected, runMiddlewares, runtime],
  );

  return {
    value,
    ready,
    ref: refRef.current,
    set,
    update,
  };
};
