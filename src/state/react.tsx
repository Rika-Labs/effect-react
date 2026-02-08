import { Effect, Fiber, Stream } from "effect";
import { useCallback, useSyncExternalStore } from "react";
import { useEffectRuntime } from "../react/provider";
import { type Equality, select, selectChanges, type Selector, type Store } from "./service";

const defaultEquality = <Value,>(left: Value, right: Value): boolean => Object.is(left, right);

export const useStore = <State,>(store: Store<State>): State =>
  useStoreSelector(store, (state) => state);

export const useStoreSelector = <State, Selected,>(
  store: Store<State>,
  selector: Selector<State, Selected>,
  equals: Equality<Selected> = defaultEquality,
): Selected => {
  const runtime = useEffectRuntime();

  const subscribe = useCallback(
    (listener: () => void) => {
      const fiber = runtime.runFork(
        Stream.runForEach(
          selectChanges(store, selector, {
            equals,
          }),
          () => Effect.sync(listener),
        ),
      );

      return () => {
        runtime.runFork(Fiber.interrupt(fiber));
      };
    },
    [equals, runtime, selector, store],
  );

  const getSnapshot = useCallback(
    () => runtime.runSync(select(store, selector)),
    [runtime, selector, store],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
