import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { snapshotQueryCache, summarizeQueryDiagnostics } from "../devtools";
import { QueryCache } from "../query/QueryCache";

describe("devtools diagnostics", () => {
  it("summarizes cache state", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache({ defaultStaleTime: 1000 });

    cache.setQueryData(["fresh"], 1);
    cache.setQueryData(["stale"], 2);
    cache.invalidate(["stale"]);
    await cache.fetch({
      key: ["failure"],
      runtime,
      query: Effect.fail("boom"),
    });

    const freshEntry = cache.ensureEntry<number, never>({ key: ["fresh"] });
    const unsubscribe = cache.subscribeEntry(freshEntry, () => {});

    const snapshot = snapshotQueryCache(cache);
    const summary = summarizeQueryDiagnostics(snapshot);

    expect(summary.total).toBe(3);
    expect(summary.stale).toBe(2);
    expect(summary.loading).toBe(0);
    expect(summary.failure).toBe(1);
    expect(summary.subscribers).toBe(1);
    expect(summary.inFlight).toBe(0);

    unsubscribe();
    await runtime.dispose();
  });

  it("tracks in-flight and loading counts", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const entry = cache.ensureEntry<string, never>({ key: ["loading"] });
    const unsubscribe = cache.subscribeEntry(entry, () => {});
    let acquired = 0;

    const query = Effect.sync(() => {
      acquired += 1;
      return "value";
    }).pipe(Effect.andThen(Effect.never));

    const promise = cache.fetch({
      entry,
      key: ["loading"],
      runtime,
      query,
    });

    while (acquired === 0) {
      await Promise.resolve();
    }

    const snapshot = snapshotQueryCache(cache);
    const summary = summarizeQueryDiagnostics(snapshot);
    expect(summary.total).toBe(1);
    expect(summary.loading).toBe(1);
    expect(summary.inFlight).toBe(1);

    unsubscribe();
    await promise;
    await runtime.dispose();
  });
});
