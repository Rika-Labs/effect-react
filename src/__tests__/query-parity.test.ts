import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { QueryCache } from "../query/QueryCache";

afterEach(() => {
  vi.useRealTimers();
});

describe("isFetching", () => {
  it("is true during loading", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["fetch-test"] });

    expect(cache.getSnapshot(entry).isFetching).toBe(false);

    const promise = cache.fetch({
      entry,
      key: ["fetch-test"],
      runtime,
      query: Effect.promise<string>(
        () => new Promise((resolve) => setTimeout(() => resolve("done"), 5)),
      ),
    });

    expect(cache.getSnapshot(entry).isFetching).toBe(true);
    expect(cache.getSnapshot(entry).status).toBe("loading");

    const result = await promise;
    expect(result.isFetching).toBe(false);
    expect(result.status).toBe("success");

    await runtime.dispose();
  });

  it("is true during refreshing", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    cache.setQueryData(["refresh-fetch"], "existing");
    const entry = cache.ensureEntry<string, never>({ key: ["refresh-fetch"] });

    const promise = cache.fetch({
      entry,
      key: ["refresh-fetch"],
      runtime,
      query: Effect.promise<string>(
        () => new Promise((resolve) => setTimeout(() => resolve("updated"), 5)),
      ),
      force: true,
    });

    expect(cache.getSnapshot(entry).isFetching).toBe(true);
    expect(cache.getSnapshot(entry).status).toBe("refreshing");

    const result = await promise;
    expect(result.isFetching).toBe(false);

    await runtime.dispose();
  });

  it("is false on initial and success states", () => {
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["static"] });
    expect(cache.getSnapshot(entry).isFetching).toBe(false);

    cache.setQueryData(["static"], "value");
    expect(cache.getSnapshot(entry).isFetching).toBe(false);
  });
});

describe("bulk operations", () => {
  it("cancelQueries cancels in-flight entries matching filter", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entryA = cache.ensureEntry<string, never>({ key: ["bulk", "a"] });
    const entryB = cache.ensureEntry<string, never>({ key: ["bulk", "b"] });
    // counters tracked via objects below

    const slowQuery = (counter: { count: number }) =>
      Effect.sync(() => {
        counter.count += 1;
        return "value";
      }).pipe(Effect.andThen(Effect.never));

    const counterA = { count: 0 };
    const counterB = { count: 0 };

    const unsubA = cache.subscribeEntry(entryA, () => {});
    const unsubB = cache.subscribeEntry(entryB, () => {});

    void cache.fetch({
      entry: entryA,
      key: ["bulk", "a"],
      runtime,
      query: slowQuery(counterA),
    });
    void cache.fetch({
      entry: entryB,
      key: ["bulk", "b"],
      runtime,
      query: slowQuery(counterB),
    });

    while (counterA.count === 0 || counterB.count === 0) {
      await Promise.resolve();
    }

    cache.cancelQueries({ predicate: (k) => k[0] === "bulk" && k[1] === "a" });

    expect(entryA.inFlight).toBeUndefined();
    expect(entryB.inFlight).not.toBeUndefined();

    cache.cancelQueries();
    expect(entryB.inFlight).toBeUndefined();

    unsubA();
    unsubB();
    await runtime.dispose();
  });

  it("resetQueries resets entries to initial state", () => {
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["r", "a"], 1);
    cache.setQueryData(["r", "b"], 2);
    const entryA = cache.ensureEntry<number, never>({ key: ["r", "a"] });
    const entryB = cache.ensureEntry<number, never>({ key: ["r", "b"] });

    cache.resetQueries({ predicate: (k) => k[1] === "a" });
    expect(cache.getSnapshot(entryA).status).toBe("initial");
    expect(cache.getSnapshot(entryA).data).toBeUndefined();
    expect(cache.getSnapshot(entryB).status).toBe("success");
    expect(cache.getSnapshot(entryB).data).toBe(2);
  });

  it("removeQueries disposes matched entries", () => {
    const cache = new QueryCache();
    cache.setQueryData(["rm", "a"], 1);
    cache.setQueryData(["rm", "b"], 2);
    cache.setQueryData(["keep"], 3);

    cache.removeQueries({ predicate: (k) => k[0] === "rm" });
    expect(cache.hasQuery(["rm", "a"])).toBe(false);
    expect(cache.hasQuery(["rm", "b"])).toBe(false);
    expect(cache.hasQuery(["keep"])).toBe(true);
  });

  it("filters by status", () => {
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["s", "a"], 1);
    cache.ensureEntry({ key: ["s", "b"] });

    cache.removeQueries({ status: "initial" });
    expect(cache.hasQuery(["s", "a"])).toBe(true);
    expect(cache.hasQuery(["s", "b"])).toBe(false);
  });

  it("filters by stale flag", () => {
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["stale-filter", "fresh"], 1);
    cache.setQueryData(["stale-filter", "stale"], 2);
    cache.invalidate(["stale-filter", "stale"]);

    cache.removeQueries({ stale: true });
    expect(cache.hasQuery(["stale-filter", "fresh"])).toBe(true);
    expect(cache.hasQuery(["stale-filter", "stale"])).toBe(false);
  });

  it("filters by status array", () => {
    const cache = new QueryCache({ defaultStaleTime: 1000 });
    cache.setQueryData(["sa", "a"], 1);
    cache.ensureEntry({ key: ["sa", "b"] });

    cache.removeQueries({ status: ["initial", "failure"] });
    expect(cache.hasQuery(["sa", "a"])).toBe(true);
    expect(cache.hasQuery(["sa", "b"])).toBe(false);
  });
});

describe("structural sharing", () => {
  it("preserves data reference when new data is structurally equal", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    cache.setQueryData(["share"], { a: 1, b: [2, 3] });
    const entry = cache.ensureEntry<{ a: number; b: number[] }, never>({
      key: ["share"],
    });
    const originalData = cache.getSnapshot(entry).data;

    await cache.fetch({
      entry,
      key: ["share"],
      runtime,
      query: Effect.succeed({ a: 1, b: [2, 3] }),
      force: true,
    });

    const afterData = cache.getSnapshot(entry).data;
    expect(afterData).toBe(originalData);

    await runtime.dispose();
  });

  it("replaces data reference when new data is different", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    cache.setQueryData(["share-diff"], { a: 1 });
    const entry = cache.ensureEntry<{ a: number }, never>({
      key: ["share-diff"],
    });
    const originalData = cache.getSnapshot(entry).data;

    await cache.fetch({
      entry,
      key: ["share-diff"],
      runtime,
      query: Effect.succeed({ a: 2 }),
      force: true,
    });

    const afterData = cache.getSnapshot(entry).data;
    expect(afterData).not.toBe(originalData);
    expect(afterData).toEqual({ a: 2 });

    await runtime.dispose();
  });

  it("does not share when structuralSharing is false", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    cache.setQueryData(["no-share"], { a: 1 });
    const entry = cache.ensureEntry<{ a: number }, never>({
      key: ["no-share"],
    });
    const originalData = cache.getSnapshot(entry).data;

    await cache.fetch({
      entry,
      key: ["no-share"],
      runtime,
      query: Effect.succeed({ a: 1 }),
      force: true,
      structuralSharing: false,
    });

    const afterData = cache.getSnapshot(entry).data;
    expect(afterData).not.toBe(originalData);
    expect(afterData).toEqual({ a: 1 });

    await runtime.dispose();
  });
});
