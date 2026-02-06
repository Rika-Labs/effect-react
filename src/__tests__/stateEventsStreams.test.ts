import { describe, expect, it, vi } from "vitest";
import { createEventChannel, type EventChannelOptions } from "../events/channel";
import { createPersistMiddleware, createDevtoolsMiddleware } from "../state/middleware";
import { subscribeToRef } from "../state/subscribe";
import { createMemoryStorage, createPersistenceStore } from "../persistence/persistence";

// ---------------------------------------------------------------------------
// Event channel: wildcard pattern matching
// ---------------------------------------------------------------------------

interface WildcardEvents {
  readonly "user.login": string;
  readonly "user.logout": string;
  readonly "order.created": number;
  readonly "order.shipped": number;
}

describe("event channel pattern subscriptions", () => {
  it("matches wildcard patterns with subscribePattern", () => {
    const channel = createEventChannel<WildcardEvents>();
    const received: { type: string; payload: unknown }[] = [];

    const unsub = channel.subscribePattern("user.*", (event) => {
      received.push({ type: String(event.type), payload: event.payload });
    });

    channel.publish("user.login", "alice");
    channel.publish("user.logout", "bob");
    channel.publish("order.created", 1);

    expect(received).toEqual([
      { type: "user.login", payload: "alice" },
      { type: "user.logout", payload: "bob" },
    ]);

    unsub();
    channel.publish("user.login", "charlie");
    expect(received).toHaveLength(2);
  });

  it("matches order.* pattern", () => {
    const channel = createEventChannel<WildcardEvents>();
    const received: number[] = [];

    const unsub = channel.subscribePattern("order.*", (event) => {
      received.push(event.payload as number);
    });

    channel.publish("user.login", "alice");
    channel.publish("order.created", 42);
    channel.publish("order.shipped", 43);

    expect(received).toEqual([42, 43]);
    unsub();
  });

  it("matches everything with *", () => {
    const channel = createEventChannel<WildcardEvents>();
    const received: string[] = [];

    const unsub = channel.subscribePattern("*", (event) => {
      received.push(String(event.type));
    });

    channel.publish("user.login", "a");
    channel.publish("order.created", 1);

    expect(received).toEqual(["user.login", "order.created"]);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// Event channel: error isolation
// ---------------------------------------------------------------------------

interface SimpleEvents {
  readonly message: string;
  readonly count: number;
}

describe("event channel error isolation", () => {
  it("isolates listener errors and calls onListenerError", () => {
    const errors: { error: unknown; type: PropertyKey }[] = [];
    const opts: EventChannelOptions = {
      onListenerError: (error, type) => errors.push({ error, type }),
    };
    const channel = createEventChannel<SimpleEvents>(opts);

    const received: string[] = [];
    channel.subscribe("message", () => {
      throw new Error("boom");
    });
    channel.subscribe("message", (value) => {
      received.push(value);
    });

    channel.publish("message", "hello");

    expect(received).toEqual(["hello"]);
    expect(errors).toHaveLength(1);
    expect((errors[0]!.error as Error).message).toBe("boom");
    expect(errors[0]!.type).toBe("message");
  });

  it("isolates errors from allListeners", () => {
    const errors: { error: unknown; type: PropertyKey }[] = [];
    const channel = createEventChannel<SimpleEvents>({
      onListenerError: (error, type) => errors.push({ error, type }),
    });

    channel.subscribeAll(() => {
      throw new Error("all-boom");
    });

    const received: string[] = [];
    channel.subscribe("message", (v) => received.push(v));

    channel.publish("message", "ok");

    expect(received).toEqual(["ok"]);
    expect(errors).toHaveLength(1);
    expect((errors[0]!.error as Error).message).toBe("all-boom");
  });

  it("swallows errors silently when no onListenerError is provided", () => {
    const channel = createEventChannel<SimpleEvents>();
    const received: string[] = [];

    channel.subscribe("message", () => {
      throw new Error("silent");
    });
    channel.subscribe("message", (v) => received.push(v));

    // Should not throw
    channel.publish("message", "test");
    expect(received).toEqual(["test"]);
  });
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

describe("state middleware factories", () => {
  it("createPersistMiddleware calls store.save on onSet", async () => {
    const storage = createMemoryStorage();
    const store = createPersistenceStore<number>({ key: "test", storage });
    const mw = createPersistMiddleware(store);

    mw.onSet?.(42, 0);

    // Wait for async save
    await new Promise((r) => setTimeout(r, 10));
    const loaded = await store.load();
    expect(loaded).toBe(42);
  });

  it("createDevtoolsMiddleware logs on onSet", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const mw = createDevtoolsMiddleware<number>("counter");

    mw.onSet?.(5, 3);

    expect(debugSpy).toHaveBeenCalledWith("[effect-react] counter state update", {
      prev: 3,
      next: 5,
    });
    debugSpy.mockRestore();
  });

  it("createDevtoolsMiddleware works without label", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const mw = createDevtoolsMiddleware<string>();

    mw.onSet?.("new", "old");

    expect(debugSpy).toHaveBeenCalledWith("[effect-react] state update", {
      prev: "old",
      next: "new",
    });
    debugSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// subscribeToRef (unit level - non-React)
// ---------------------------------------------------------------------------

describe("subscribeToRef", () => {
  it("receives values from a SubscriptionRef and unsubscribes", async () => {
    const { Effect, Layer, ManagedRuntime, SubscriptionRef } = await import("effect");
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(0));

    const received: number[] = [];
    const sub = subscribeToRef(runtime, ref, (value) => {
      received.push(value);
    });

    await Effect.runPromise(SubscriptionRef.set(ref, 1));
    await new Promise((r) => setTimeout(r, 50));
    await Effect.runPromise(SubscriptionRef.set(ref, 2));
    await new Promise((r) => setTimeout(r, 50));

    // Should have received at least value 2 (the latest)
    expect(received).toContain(2);
    expect(received.length).toBeGreaterThanOrEqual(1);

    sub.unsubscribe();
    await Effect.runPromise(SubscriptionRef.set(ref, 99));
    await new Promise((r) => setTimeout(r, 50));

    // Should not receive new values after unsubscribe
    expect(received).not.toContain(99);
    await runtime.dispose();
  });
});

// ---------------------------------------------------------------------------
// Existing event channel tests still pass
// ---------------------------------------------------------------------------

describe("event channel backwards compatibility", () => {
  it("publishes typed events to direct subscribers", () => {
    const channel = createEventChannel<SimpleEvents>();
    const received: string[] = [];
    const unsubscribe = channel.subscribe("message", (value) => {
      received.push(value);
    });

    channel.publish("message", "a");
    channel.publish("message", "b");
    unsubscribe();
    channel.publish("message", "c");

    expect(received).toEqual(["a", "b"]);
  });

  it("clear still works", () => {
    const channel = createEventChannel<SimpleEvents>();
    const received: string[] = [];
    channel.subscribe("message", (v) => received.push(v));
    channel.subscribeAll(() => {});

    channel.publish("message", "first");
    channel.clear();
    channel.publish("message", "second");

    expect(received).toEqual(["first"]);
    expect(channel.listenerCount()).toBe(0);
  });
});
