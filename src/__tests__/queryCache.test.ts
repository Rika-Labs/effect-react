import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { QueryCache } from "../query/QueryCache";
import { DEHYDRATED_STATE_VERSION } from "../query/types";

const customKeyHasher = (key: readonly unknown[]) => `custom:${String(key[0])}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("QueryCache", () => {
  it("dedupes concurrent fetches", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let calls = 0;

    const query = Effect.promise<string>(() => {
      calls += 1;
      return new Promise((resolve) => {
        setTimeout(() => resolve("ok"), 5);
      });
    });

    const one = cache.fetch({ key: ["a"], runtime, query });
    const two = cache.fetch({ key: ["a"], runtime, query });
    const [first, second] = await Promise.all([one, two]);

    expect(calls).toBe(1);
    expect(first.status).toBe("success");
    expect(first.data).toBe("ok");
    expect(second.status).toBe("success");

    await runtime.dispose();
  });

  it("force refetch cancels previous in-flight execution and restarts", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["force-refetch"] });
    let acquired = 0;
    let interrupted = 0;

    const slowQuery = Effect.sync(() => {
      acquired += 1;
      return "slow";
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted += 1;
        }),
      ),
    );

    const first = cache.fetch({
      entry,
      key: ["force-refetch"],
      runtime,
      query: slowQuery,
    });
    while (acquired === 0) {
      await Promise.resolve();
    }
    const second = cache.fetch({
      entry,
      key: ["force-refetch"],
      runtime,
      query: Effect.succeed("fast"),
      force: true,
    });

    const secondSnapshot = await second;
    const firstSnapshot = await first;

    expect(interrupted).toBe(1);
    expect(secondSnapshot.status).toBe("success");
    expect(secondSnapshot.data).toBe("fast");
    expect(firstSnapshot.status).toBe("success");
    expect(firstSnapshot.data).toBe("fast");
    await runtime.dispose();
  });

  it("records failure snapshots and allows refetch", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const first = await cache.fetch({
      key: ["failure"],
      runtime,
      query: Effect.fail("boom"),
    });
    const entry = cache.ensureEntry<never, string>({ key: ["failure"] });

    expect(first.status).toBe("failure");
    expect(cache.shouldFetch(entry)).toBe(true);

    const second = await cache.fetch({
      key: ["failure"],
      runtime,
      query: Effect.succeed("ok"),
    });

    expect(second.status).toBe("success");
    expect(second.data).toBe("ok");
    await runtime.dispose();
  });

  it("cancels in-flight work when last subscriber unsubscribes", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["cancel"] });
    let acquired = 0;
    let interrupted = 0;

    const query = Effect.sync(() => {
      acquired += 1;
      return "ready";
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted += 1;
        }),
      ),
    );

    const unsubscribe = cache.subscribeEntry(entry, () => {});
    const promise = cache.fetch({
      entry,
      key: ["cancel"],
      runtime,
      query,
    });

    while (acquired === 0) {
      await Promise.resolve();
    }
    unsubscribe();
    const snapshot = await promise;

    expect(interrupted).toBe(1);
    expect(snapshot.status).toBe("initial");
    expect(entry.inFlight).toBeUndefined();

    await runtime.dispose();
  });

  it("tracks stale and gc timers", () => {
    vi.useFakeTimers();
    const cache = new QueryCache({
      defaultStaleTime: 20,
      defaultGcTime: 30,
    });

    cache.setQueryData(["timer"], 1);
    const entry = cache.ensureEntry<number, never>({ key: ["timer"] });
    expect(cache.getSnapshot(entry).isStale).toBe(false);

    vi.advanceTimersByTime(21);
    expect(cache.getSnapshot(entry).isStale).toBe(true);

    const unsubscribe = cache.subscribeEntry(entry, () => {});
    unsubscribe();

    vi.advanceTimersByTime(31);
    expect(cache.hasQuery(["timer"])).toBe(false);
  });

  it("applies initialData to an existing empty entry", () => {
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["seed"] });
    expect(cache.getSnapshot(entry).data).toBeUndefined();

    const ensured = cache.ensureEntry<string, never>({
      key: ["seed"],
      initialData: "seeded",
      staleTime: 10,
      gcTime: 20,
    });

    expect(ensured).toBe(entry);
    expect(cache.getSnapshot(entry).status).toBe("success");
    expect(cache.getSnapshot(entry).data).toBe("seeded");
  });

  it("invalidates by exact key and predicate", () => {
    const cache = new QueryCache({ defaultStaleTime: 10_000 });
    cache.setQueryData(["a"], 1);
    cache.setQueryData(["b"], 2);
    const entryA = cache.ensureEntry<number, never>({ key: ["a"] });
    const entryB = cache.ensureEntry<number, never>({ key: ["b"] });

    expect(cache.getSnapshot(entryA).isStale).toBe(false);
    expect(cache.getSnapshot(entryB).isStale).toBe(false);

    cache.invalidate(["a"]);
    expect(cache.getSnapshot(entryA).isStale).toBe(true);
    expect(cache.getSnapshot(entryB).isStale).toBe(false);

    cache.invalidate((key) => key[0] === "b");
    expect(cache.getSnapshot(entryB).isStale).toBe(true);
  });

  it("invalidates all queries when no target is provided", () => {
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["a"], 1);
    cache.setQueryData(["b"], 2);
    const entryA = cache.ensureEntry<number, never>({ key: ["a"] });
    const entryB = cache.ensureEntry<number, never>({ key: ["b"] });

    cache.invalidate();
    expect(cache.getSnapshot(entryA).isStale).toBe(true);
    expect(cache.getSnapshot(entryB).isStale).toBe(true);
  });

  it("dehydrates and hydrates successful snapshots", () => {
    const source = new QueryCache({ defaultStaleTime: 1000, defaultGcTime: 2000 });
    source.setQueryData(["x"], { ok: true });
    const state = source.dehydrate();
    expect(state.version).toBe(DEHYDRATED_STATE_VERSION);

    const target = new QueryCache();
    target.hydrate(state);

    expect(target.getQueryData<{ ok: boolean }>(["x"])).toEqual({ ok: true });
    expect(target.size()).toBe(1);
  });

  it("rejects unsupported hydration versions", () => {
    const cache = new QueryCache();
    expect(() =>
      cache.hydrate({
        version: 999 as typeof DEHYDRATED_STATE_VERSION,
        queries: [],
      }),
    ).toThrow("Unsupported dehydrated state version");
  });

  it("dehydrate skips non-success entries", () => {
    const cache = new QueryCache();
    cache.ensureEntry({ key: ["initial-only"] });
    cache.setQueryData(["success"], 1);
    expect(cache.dehydrate().queries).toHaveLength(1);
  });

  it("hydrates entries stale immediately when staleTime is zero", () => {
    const cache = new QueryCache();
    cache.hydrate({
      version: DEHYDRATED_STATE_VERSION,
      queries: [
        {
          key: ["zero-stale"],
          hash: "zero-stale",
          data: 1,
          updatedAt: 100,
          staleTimeMs: 0,
          gcTimeMs: 500,
          isStale: false,
        },
      ],
    });
    const entry = cache.ensureEntry<number, never>({ key: ["zero-stale"] });
    expect(cache.getSnapshot(entry).isStale).toBe(true);
  });

  it("hydrates entries stale immediately when hydrated data is already expired", () => {
    const cache = new QueryCache({ now: () => 1000 });
    cache.hydrate({
      version: DEHYDRATED_STATE_VERSION,
      queries: [
        {
          key: ["expired"],
          hash: "expired",
          data: 1,
          updatedAt: 100,
          staleTimeMs: 100,
          gcTimeMs: 500,
          isStale: false,
        },
      ],
    });
    const entry = cache.ensureEntry<number, never>({ key: ["expired"] });
    expect(cache.getSnapshot(entry).isStale).toBe(true);
  });

  it("hydrates entries and marks stale when remaining hydration time elapses", () => {
    vi.useFakeTimers();
    let now = 100;
    const cache = new QueryCache({ now: () => now });
    cache.hydrate({
      version: DEHYDRATED_STATE_VERSION,
      queries: [
        {
          key: ["delayed"],
          hash: "delayed",
          data: 1,
          updatedAt: 100,
          staleTimeMs: 20,
          gcTimeMs: 500,
          isStale: false,
        },
      ],
    });
    const entry = cache.ensureEntry<number, never>({ key: ["delayed"] });
    expect(cache.getSnapshot(entry).isStale).toBe(false);

    now = 121;
    vi.advanceTimersByTime(21);
    expect(cache.getSnapshot(entry).isStale).toBe(true);
  });

  it("supports custom keyHasher for set/get/remove", () => {
    const cache = new QueryCache();
    cache.setQueryData(["x"], 1, {
      keyHasher: customKeyHasher,
      staleTime: 10,
      gcTime: 20,
    });
    expect(cache.getQueryData<number>(["x"], customKeyHasher)).toBe(1);
    expect(cache.removeQuery(["x"], customKeyHasher)).toBe(true);
  });

  it("invalidates active subscribers and triggers background refresh", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache({ defaultStaleTime: 10_000 });
    let value = 0;
    const query = Effect.sync(() => {
      value += 1;
      return value;
    });

    const entry = cache.ensureEntry<number, never>({ key: ["active-invalidate"] });
    const unsubscribe = cache.subscribeEntry(entry, () => {});
    await cache.fetch({
      entry,
      key: ["active-invalidate"],
      runtime,
      query,
    });
    expect(cache.getSnapshot(entry).data).toBe(1);

    cache.invalidate(["active-invalidate"]);
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.getSnapshot(entry).data).toBe(2);
    unsubscribe();
    await runtime.dispose();
  });

  it("prefetch delegates to fetch", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    await cache.prefetch({
      key: ["prefetch"],
      runtime,
      query: Effect.succeed("done"),
    });
    expect(cache.getQueryData<string>(["prefetch"])).toBe("done");
    await runtime.dispose();
  });

  it("removes query immediately when gcTime is zero", () => {
    const cache = new QueryCache({ defaultGcTime: 0 });
    cache.setQueryData(["immediate-gc"], 1);
    const entry = cache.ensureEntry<number, never>({ key: ["immediate-gc"] });
    const unsubscribe = cache.subscribeEntry(entry, () => {});
    unsubscribe();
    expect(cache.hasQuery(["immediate-gc"])).toBe(false);
  });

  it("keeps query when gc timer fires but subscriber re-attached", () => {
    vi.useFakeTimers();
    const cache = new QueryCache({ defaultGcTime: 10 });
    cache.setQueryData(["hold"], 1);
    const entry = cache.ensureEntry<number, never>({ key: ["hold"] });
    const unsubscribeOne = cache.subscribeEntry(entry, () => {});
    unsubscribeOne();
    const unsubscribeTwo = cache.subscribeEntry(entry, () => {});

    vi.advanceTimersByTime(11);
    expect(cache.hasQuery(["hold"])).toBe(true);

    unsubscribeTwo();
    vi.advanceTimersByTime(11);
    expect(cache.hasQuery(["hold"])).toBe(false);
  });

  it("restores previous success snapshot when refreshing request is canceled", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    cache.setQueryData(["refresh"], "existing");
    const entry = cache.ensureEntry<string, never>({ key: ["refresh"] });
    let acquired = 0;
    let interrupted = 0;

    const query = Effect.sync(() => {
      acquired += 1;
      return "next";
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted += 1;
        }),
      ),
    );

    const unsubscribe = cache.subscribeEntry(entry, () => {});
    const promise = cache.fetch({
      entry,
      key: ["refresh"],
      runtime,
      query,
    });

    while (acquired === 0) {
      await Promise.resolve();
    }
    expect(cache.getSnapshot(entry).status).toBe("refreshing");
    unsubscribe();

    const snapshot = await promise;
    expect(interrupted).toBe(1);
    expect(snapshot.status).toBe("success");
    expect(snapshot.data).toBe("existing");
    expect(snapshot.isStale).toBe(true);
    await runtime.dispose();
  });

  it("clear cancels in-flight entries", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["clear-inflight"] });
    let acquired = 0;
    let interrupted = 0;

    const query = Effect.sync(() => {
      acquired += 1;
      return "value";
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted += 1;
        }),
      ),
    );

    const promise = cache.fetch({
      entry,
      key: ["clear-inflight"],
      runtime,
      query,
    });
    while (acquired === 0) {
      await Promise.resolve();
    }

    cache.clear();
    const snapshot = await promise;

    expect(interrupted).toBe(1);
    expect(snapshot.status).toBe("initial");
    expect(cache.size()).toBe(0);
    await runtime.dispose();
  });

  it("returns diagnostics across query states", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["success"], 1);
    const successEntry = cache.ensureEntry<number, never>({ key: ["success"] });
    const unsubscribe = cache.subscribeEntry(successEntry, () => {});

    await cache.fetch({
      key: ["failure"],
      runtime,
      query: Effect.fail("boom"),
    });

    const snapshot = cache.diagnostics();
    expect(snapshot.size).toBe(2);

    const successHash = cache.keyHasher(["success"]);
    const failureHash = cache.keyHasher(["failure"]);
    const success = snapshot.entries.find((entry) => entry.hash === successHash);
    const failure = snapshot.entries.find((entry) => entry.hash === failureHash);

    expect(success?.status).toBe("success");
    expect(success?.subscribers).toBe(1);
    expect(success?.inFlight).toBe(false);
    expect(success?.isStale).toBe(false);

    expect(failure?.status).toBe("failure");
    expect(failure?.subscribers).toBe(0);
    expect(failure?.inFlight).toBe(false);
    expect(failure?.isStale).toBe(true);

    unsubscribe();
    await runtime.dispose();
  });

  it("getQueryData returns undefined for missing keys", () => {
    const cache = new QueryCache();
    expect(cache.getQueryData(["nonexistent"])).toBeUndefined();
  });

  it("cancelQueries with key filter only cancels matching entries", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    cache.setQueryData(["keep"], "a");
    cache.setQueryData(["cancel-me"], "b");

    cache.cancelQueries({ key: ["cancel-me"] });
    expect(cache.getQueryData(["keep"])).toBe("a");
    await runtime.dispose();
  });

  it("double unsubscribe is a noop", () => {
    const cache = new QueryCache({ defaultGcTime: 0 });
    cache.setQueryData(["double-unsub"], "val");
    const entry = cache.ensureEntry({ key: ["double-unsub"] });
    const unsubscribe = cache.subscribeEntry(entry, () => {});
    unsubscribe();
    expect(cache.hasQuery(["double-unsub"])).toBe(false);
    // Second call should be a noop
    unsubscribe();
  });

  it("ensureEntry with initialData schedules stale timer", () => {
    vi.useFakeTimers();
    const cache = new QueryCache({ defaultStaleTime: 50 });
    const entry = cache.ensureEntry<string, never>({
      key: ["with-initial"],
      initialData: "seeded",
    });
    const snapshot = cache.getSnapshot(entry);
    expect(snapshot.status).toBe("success");
    expect(snapshot.data).toBe("seeded");
    expect(snapshot.isStale).toBe(false);

    vi.advanceTimersByTime(51);
    expect(cache.getSnapshot(entry).isStale).toBe(true);
  });

  it("removes and clears entries", () => {
    const cache = new QueryCache();
    cache.setQueryData(["one"], 1);
    cache.setQueryData(["two"], 2);
    expect(cache.removeQuery(["one"])).toBe(true);
    expect(cache.removeQuery(["one"])).toBe(false);
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
