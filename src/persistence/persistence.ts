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

export const createPersistenceStore = <A>(
  options: CreatePersistenceStoreOptions<A>,
): PersistenceStore<A> => {
  const codec = options.codec ?? jsonCodec<A>();

  return {
    key: options.key,
    save: async (value: A) => {
      const encoded = codec.encode(value);
      await options.storage.setItem(options.key, encoded);
    },
    load: async () => {
      const encoded = await options.storage.getItem(options.key);
      if (encoded === null) {
        return undefined;
      }
      try {
        return codec.decode(encoded);
      } catch {
        return undefined;
      }
    },
    clear: async () => {
      await options.storage.removeItem(options.key);
    },
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

export const persistQueryState = async (
  cache: QueryCache,
  store: PersistenceStore<DehydratedState>,
): Promise<void> => {
  await store.save(cache.dehydrate());
};

export const hydrateQueryState = async (
  cache: QueryCache,
  store: PersistenceStore<DehydratedState>,
): Promise<boolean> => {
  const state = await store.load();
  if (state === undefined) {
    return false;
  }
  cache.hydrate(state);
  return true;
};

export const persistSubscriptionState = async <A>(
  store: PersistenceStore<A>,
  state: A | (() => A),
): Promise<void> => {
  const value = typeof state === "function" ? (state as () => A)() : state;
  await store.save(value);
};

export const hydratePersistedSnapshot = async <A>(
  store: PersistenceStore<A>,
): Promise<A | undefined> => store.load();
