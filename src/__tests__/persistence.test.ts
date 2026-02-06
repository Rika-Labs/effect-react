import { describe, expect, it } from "vitest";
import { QueryCache } from "../query/QueryCache";
import { DEHYDRATED_STATE_VERSION, type DehydratedState } from "../query/types";
import {
  createMemoryStorage,
  createPersistenceStore,
  hydratePersistedSnapshot,
  hydrateQueryState,
  persistQueryState,
  persistSubscriptionState,
} from "../persistence";

describe("persistence primitives", () => {
  it("saves, loads, and clears persisted values", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<{ readonly ok: boolean }>({
      key: "key",
      storage,
    });

    await store.save({ ok: true });
    await expect(store.load()).resolves.toEqual({ ok: true });

    await store.clear();
    await expect(store.load()).resolves.toBeUndefined();
  });

  it("returns undefined when decode fails", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<number>({
      key: "bad",
      storage,
      codec: {
        encode: (value) => String(value),
        decode: () => {
          throw new Error("invalid");
        },
      },
    });

    await storage.setItem("bad", "x");
    await expect(store.load()).resolves.toBeUndefined();
  });

  it("persists and hydrates query state", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<DehydratedState>({
      key: "query",
      storage,
    });
    const source = new QueryCache({ defaultStaleTime: 1000, defaultGcTime: 2000 });
    source.setQueryData(["item"], { value: 1 });

    await persistQueryState(source, store);

    const target = new QueryCache();
    const hydrated = await hydrateQueryState(target, store);
    expect(hydrated).toBe(true);
    expect(target.getQueryData<{ readonly value: number }>(["item"])).toEqual({ value: 1 });
  });

  it("reports false when query hydration snapshot is missing", async () => {
    const store = createPersistenceStore<DehydratedState>({
      key: "query-empty",
      storage: createMemoryStorage(),
    });

    const cache = new QueryCache();
    const hydrated = await hydrateQueryState(cache, store);

    expect(hydrated).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it("persists subscription values and hydrates snapshots", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<number>({
      key: "state",
      storage,
    });

    await persistSubscriptionState(store, 5);
    await expect(hydratePersistedSnapshot(store)).resolves.toBe(5);

    await persistSubscriptionState(store, () => 8);
    await expect(hydratePersistedSnapshot(store)).resolves.toBe(8);

    const entries = storage.entries();
    expect(entries).toEqual([["state", "8"]]);
  });

  it("hydrates query state with explicit dehydrated payload", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<DehydratedState>({
      key: "explicit",
      storage,
    });

    await store.save({
      version: DEHYDRATED_STATE_VERSION,
      queries: [
        {
          key: ["explicit"],
          hash: "explicit",
          data: "value",
          updatedAt: 1,
          staleTimeMs: 100,
          gcTimeMs: 100,
          isStale: false,
        },
      ],
    });

    const cache = new QueryCache();
    expect(await hydrateQueryState(cache, store)).toBe(true);
    expect(cache.getQueryData<string>(["explicit"])).toBe("value");
  });
});
