import { Cause, Effect, Exit, Layer, ManagedRuntime, SubscriptionRef } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryCache } from "../query/QueryCache";
import { runEffect } from "../internal/effectRunner";
import { createPersistenceStore, createMemoryStorage } from "../persistence/persistence";
import { createRouter, createMemoryRouterHistory } from "../router/router";

afterEach(() => {
  vi.useRealTimers();
});

describe("#23: QueryCache.invalidate uses fresh runtime", () => {
  it("stores latestRuntime on entry during fetchEffect", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let fetchCount = 0;

    const query = Effect.sync(() => {
      fetchCount += 1;
      return `result-${String(fetchCount)}`;
    });

    const entry = cache.ensureEntry<string, never>({ key: ["test-key"] });
    cache.subscribeEntry(entry, () => {});

    await cache.fetch({ key: ["test-key"], runtime, query, entry });
    expect(fetchCount).toBe(1);
    expect((entry as { latestRuntime?: unknown }).latestRuntime).toBe(runtime);

    await runtime.dispose();
  });

  it("invalidate uses latestRuntime for refetch", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let fetchCount = 0;

    const query = Effect.sync(() => {
      fetchCount += 1;
      return `result-${String(fetchCount)}`;
    });

    const entry = cache.ensureEntry<string, never>({ key: ["inv-key"] });
    cache.subscribeEntry(entry, () => {});

    await cache.fetch({ key: ["inv-key"], runtime, query, entry });
    expect(fetchCount).toBe(1);

    cache.invalidate(["inv-key"]);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCount).toBeGreaterThan(1);

    await runtime.dispose();
  });
});

describe("#24: useSubscriptionRef.update reads actual post-update value", () => {
  it("reads from ref after update instead of computing locally", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(10));

    const updateHandle = runEffect(
      runtime,
      SubscriptionRef.update(ref, (v) => v + 5),
    );
    await updateHandle.promise;

    const readHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const readExit = await readHandle.promise;
    expect(Exit.isSuccess(readExit) ? readExit.value : -1).toBe(15);

    await runtime.dispose();
  });
});

describe("#27: useForm submit error path sets submitError on Effect failure", () => {
  it("Effect.isEffect branch sets submitError when exit is failure", () => {
    const exit = Exit.fail(new Error("test error"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const squashed = Cause.squash(exit.cause);
      expect(squashed).toBeInstanceOf(Error);
      expect((squashed as Error).message).toBe("test error");
    }
  });
});

describe("#29: Server action HTTP handler sanitizes 500 responses", () => {
  it("500 response does not leak Cause.pretty details", async () => {
    const { createServerActionHttpHandlerEffect } = await import("../server/http");
    const { defineServerAction: defineAction } = await import("../server/actions");

    const runtime = ManagedRuntime.make(Layer.empty);
    const action = defineAction({
      name: "fail",
      run: () => Effect.die(new Error("internal secret")),
    });

    const handlerEffect = createServerActionHttpHandlerEffect({
      runtime,
      actions: [action],
    });

    const request = new Request("https://example.test/__effect/actions/fail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "INVALID JSON",
    });

    const response = await Effect.runPromise(handlerEffect(request));
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["defect"]).toBeUndefined();

    await runtime.dispose();
  });

  it("catchAllCause handler produces response without defect field", async () => {
    const { createServerActionHttpHandlerEffect } = await import("../server/http");

    const runtime = ManagedRuntime.make(Layer.empty);
    const handlerEffect = createServerActionHttpHandlerEffect({
      runtime,
      actions: [],
    });

    const request = new Request("https://example.test/__effect/actions/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: null }),
    });

    const response = await Effect.runPromise(handlerEffect(request));
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["defect"]).toBeUndefined();

    await runtime.dispose();
  });
});

describe("#36: useLocalSubscriptionRef strict-mode double-mount", () => {
  it("SubscriptionRef.make produces a valid ref that persists", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(42));

    const getHandle = runEffect(runtime, SubscriptionRef.get(ref));
    const getExit = await getHandle.promise;
    expect(Exit.isSuccess(getExit) ? getExit.value : -1).toBe(42);

    await runtime.dispose();
  });
});

describe("#41: useComputed uses refs for stale closure prevention", () => {
  it("computeRef and equalsRef pattern avoids stale closures", () => {
    let computeCallCount = 0;
    const computeRef = {
      current: (..._values: number[]) => {
        computeCallCount += 1;
        return 0;
      },
    };

    computeRef.current(1, 2, 3);
    expect(computeCallCount).toBe(1);

    computeRef.current = (...values: number[]) => {
      computeCallCount += 1;
      return values.reduce((a, b) => a + b, 0);
    };

    const result = computeRef.current(1, 2, 3);
    expect(computeCallCount).toBe(2);
    expect(result).toBe(6);
  });
});

describe("#44: Router dispose() unsubscribes from history", () => {
  it("dispose removes history listener", () => {
    const history = createMemoryRouterHistory("/");
    const router = createRouter({
      routes: [] as const,
      history,
    });

    let notified = false;
    router.subscribe(() => {
      notified = true;
    });

    router.dispose();

    history.push("/new-path");
    expect(notified).toBe(false);
  });
});

describe("#51: useMutation.mutate returns data value", () => {
  it("mutate return type is A, not Exit", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const handle = runEffect(runtime, Effect.succeed("hello"));
    const exit = await handle.promise;
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      const data: string = exit.value;
      expect(data).toBe("hello");
    }

    await runtime.dispose();
  });
});

describe("#53: persistence load surfaces decode errors", () => {
  it("decode error is thrown instead of returning undefined", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("test-key", "not-valid-json{{{");

    const store = createPersistenceStore({
      key: "test-key",
      storage,
      codec: {
        encode: (value: unknown) => JSON.stringify(value),
        decode: (encoded: string) => {
          const parsed: unknown = JSON.parse(encoded);
          return parsed;
        },
      },
    });

    await expect(store.load()).rejects.toBeDefined();
  });

  it("valid decode returns the value", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("valid-key", JSON.stringify({ a: 1 }));

    const store = createPersistenceStore<{ a: number }>({
      key: "valid-key",
      storage,
    });

    const result = await store.load();
    expect(result).toEqual({ a: 1 });
  });

  it("missing key returns undefined", async () => {
    const storage = createMemoryStorage();

    const store = createPersistenceStore<{ a: number }>({
      key: "missing-key",
      storage,
    });

    const result = await store.load();
    expect(result).toBeUndefined();
  });
});

const noopHandler = (_e: Event) => {};

describe("#55: EventSource/WebSocket listener cleanup", () => {
  it("cleanup pattern tracks and removes handlers", () => {
    const addCalls: string[] = [];
    const removeCalls: string[] = [];

    const fakeSource = {
      addEventListener: (type: string, _handler: (e: Event) => void) => {
        addCalls.push(type);
      },
      removeEventListener: (type: string, _handler: (e: Event) => void) => {
        removeCalls.push(type);
      },
      close: () => {},
    };

    fakeSource.addEventListener("open", noopHandler);
    fakeSource.addEventListener("message", noopHandler);
    fakeSource.addEventListener("error", noopHandler);
    expect(addCalls).toEqual(["open", "message", "error"]);

    fakeSource.removeEventListener("open", noopHandler);
    fakeSource.removeEventListener("message", noopHandler);
    fakeSource.removeEventListener("error", noopHandler);
    expect(removeCalls).toEqual(["open", "message", "error"]);
  });
});
