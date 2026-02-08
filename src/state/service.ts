import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";

export type Selector<State, Selected> = (state: State) => Selected;
export type Equality<Selected> = (left: Selected, right: Selected) => boolean;

const defaultEquality = <Value>(left: Value, right: Value): boolean => Object.is(left, right);

export interface Store<State> {
  readonly ref: SubscriptionRef.SubscriptionRef<State>;
}

export interface DerivedStore<Selected> {
  readonly get: Effect.Effect<Selected>;
  readonly changes: Stream.Stream<Selected>;
}

export interface SelectChangesOptions<Selected> {
  readonly equals?: Equality<Selected>;
  readonly distinct?: boolean;
}

export type StoreTag<State> = Context.Tag<Store<State>, Store<State>>;

export const createStore = <State>(initial: State): Effect.Effect<Store<State>, never, never> =>
  Effect.map(SubscriptionRef.make(initial), (ref) => ({ ref }));

export const createStoreFromEffect = <State, E, R>(
  initial: Effect.Effect<State, E, R>,
): Effect.Effect<Store<State>, E, R> =>
  Effect.flatMap(initial, createStore);

export const createStoreTag = <State>(key: string): StoreTag<State> =>
  Context.GenericTag<Store<State>>(key);

export const makeStoreLayer = <State>(
  tag: StoreTag<State>,
  initial: State,
): Layer.Layer<Store<State>, never, never> =>
  Layer.effect(tag, createStore(initial));

export const makeStoreLayerFromEffect = <State, E, R>(
  tag: StoreTag<State>,
  initial: Effect.Effect<State, E, R>,
): Layer.Layer<Store<State>, E, R> =>
  Layer.effect(tag, createStoreFromEffect(initial));

export const get = <State>(store: Store<State>): Effect.Effect<State, never, never> =>
  SubscriptionRef.get(store.ref);

export const set = <State>(
  store: Store<State>,
  value: State,
): Effect.Effect<void, never, never> =>
  SubscriptionRef.set(store.ref, value);

export const update = <State>(
  store: Store<State>,
  mutate: (state: State) => State,
): Effect.Effect<void, never, never> =>
  SubscriptionRef.update(store.ref, mutate);

export const modify = <State, Result>(
  store: Store<State>,
  mutate: (state: State) => readonly [Result, State],
): Effect.Effect<Result, never, never> =>
  SubscriptionRef.modify(store.ref, mutate);

export const select = <State, Selected>(
  store: Store<State>,
  selector: Selector<State, Selected>,
): Effect.Effect<Selected, never, never> =>
  Effect.map(get(store), selector);

export const changes = <State>(store: Store<State>): Stream.Stream<State, never, never> =>
  store.ref.changes;

export const selectChanges = <State, Selected>(
  store: Store<State>,
  selector: Selector<State, Selected>,
  options: SelectChangesOptions<Selected> = {},
): Stream.Stream<Selected, never, never> => {
  const selected = changes(store).pipe(Stream.map(selector));
  if (options.distinct === false) {
    return selected;
  }
  return selected.pipe(Stream.changesWith(options.equals ?? defaultEquality<Selected>));
};

export const derive = <State, Selected>(
  store: Store<State>,
  selector: Selector<State, Selected>,
  options: SelectChangesOptions<Selected> = {},
): DerivedStore<Selected> => ({
  get: select(store, selector),
  changes: selectChanges(store, selector, options),
});

