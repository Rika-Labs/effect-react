import { Cause, Effect, Exit } from "effect";
import type { QueryCache } from "../query/QueryCache";
import type { DehydratedState } from "../query/types";

export interface PersistenceStorage {
  readonly getItem: (key: string) => string | null | Promise<string | null>;
  readonly setItem: (key: string, value: string) => void | Promise<void>;
  readonly removeItem: (key: string) => void | Promise<void>;
}

export interface PersistenceCodec<A> {
  readonly encode: (value: A) => string;
  readonly decode: (encoded: string) => A;
}

export interface PersistenceStore<A> {
  readonly key: string;
  readonly save: (value: A) => Promise<void>;
  readonly load: () => Promise<A | undefined>;
  readonly clear: () => Promise<void>;
}

export interface CreatePersistenceStoreOptions<A> {
  readonly key: string;
  readonly storage: PersistenceStorage;
  readonly codec?: PersistenceCodec<A>;
}

const jsonCodec = <A>(): PersistenceCodec<A> => ({
  encode: (value) => JSON.stringify(value),
  decode: (encoded) => JSON.parse(encoded) as A,
});

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { readonly then?: unknown }).then === "function";

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

const fromMaybePromiseEffect = <A>(
  thunk: () => A | PromiseLike<A>,
): Effect.Effect<A, unknown, never> =>
  Effect.try({
    try: thunk,
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((value) =>
      isPromiseLike<A>(value)
        ? Effect.tryPromise({
            try: () => value,
            catch: (cause) => cause,
          })
        : Effect.succeed(value),
    ),
  );

const fromPromiseEffect = <A>(thunk: () => Promise<A>): Effect.Effect<A, unknown, never> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => cause,
  });

export const createPersistenceStore = <A>(
  options: CreatePersistenceStoreOptions<A>,
): PersistenceStore<A> => {
  const codec = options.codec ?? jsonCodec<A>();

  const saveEffect = (value: A): Effect.Effect<void, unknown, never> =>
    Effect.gen(function* () {
      const encoded = codec.encode(value);
      yield* fromMaybePromiseEffect(() => options.storage.setItem(options.key, encoded));
    });

  const loadEffect = (): Effect.Effect<A | undefined, unknown, never> =>
    fromMaybePromiseEffect(() => options.storage.getItem(options.key)).pipe(
      Effect.map((encoded) => {
        if (encoded === null) {
          return undefined;
        }
        try {
          return codec.decode(encoded);
        } catch {
          return undefined;
        }
      }),
    );

  const clearEffect = (): Effect.Effect<void, unknown, never> =>
    fromMaybePromiseEffect(() => options.storage.removeItem(options.key));

  return {
    key: options.key,
    save: (value) => runEffectWithSquashedCause(saveEffect(value)),
    load: () => runEffectWithSquashedCause(loadEffect()),
    clear: () => runEffectWithSquashedCause(clearEffect()),
  };
};

export interface MemoryStorage extends PersistenceStorage {
  readonly entries: () => readonly [string, string][];
}

export const createMemoryStorage = (): MemoryStorage => {
  const map = new Map<string, string>();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    entries: () => Array.from(map.entries()),
  };
};

export const persistQueryState = (
  cache: QueryCache,
  store: PersistenceStore<DehydratedState>,
): Promise<void> =>
  runEffectWithSquashedCause(
    Effect.gen(function* () {
      yield* fromPromiseEffect(() => store.save(cache.dehydrate()));
    }),
  );

export const hydrateQueryState = (
  cache: QueryCache,
  store: PersistenceStore<DehydratedState>,
): Promise<boolean> =>
  runEffectWithSquashedCause(
    Effect.gen(function* () {
      const state = yield* fromPromiseEffect(() => store.load());
      if (state === undefined) {
        return false;
      }
      cache.hydrate(state);
      return true;
    }),
  );

export const persistSubscriptionState = <A>(
  store: PersistenceStore<A>,
  state: A | (() => A),
): Promise<void> =>
  runEffectWithSquashedCause(
    Effect.gen(function* () {
      const value = typeof state === "function" ? (state as () => A)() : state;
      yield* fromPromiseEffect(() => store.save(value));
    }),
  );

export const hydratePersistedSnapshot = <A>(store: PersistenceStore<A>): Promise<A | undefined> =>
  runEffectWithSquashedCause(fromPromiseEffect(() => store.load()));
