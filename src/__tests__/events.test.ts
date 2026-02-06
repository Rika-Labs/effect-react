import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createEventChannel } from "../events";

interface TestEvents {
  readonly message: string;
  readonly count: number;
}

describe("event channel primitives", () => {
  it("publishes typed events to direct subscribers", () => {
    const channel = createEventChannel<TestEvents>();
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

  it("publishes envelopes to all-subscribers and tracks listener counts", async () => {
    const channel = createEventChannel<TestEvents>();
    const events: { readonly type: keyof TestEvents; readonly payload: string | number }[] = [];
    const offMessage = channel.subscribe("message", (value) => {
      events.push({ type: "message", payload: value });
    });
    const offAll = channel.subscribeAll((event) => {
      events.push({
        type: event.type,
        payload: event.payload,
      });
    });

    await Effect.runPromise(channel.publishEffect("count", 1));
    channel.publish("message", "value");

    expect(channel.listenerCount()).toBe(2);
    expect(channel.listenerCount("message")).toBe(1);
    expect(channel.listenerCount("count")).toBe(0);
    expect(events).toEqual([
      { type: "count", payload: 1 },
      { type: "message", payload: "value" },
      { type: "message", payload: "value" },
    ]);

    offMessage();
    offAll();
    expect(channel.listenerCount()).toBe(0);
  });

  it("supports once and next effect subscriptions", async () => {
    const channel = createEventChannel<TestEvents>();
    const oncePromise = channel.once("count");
    const nextEffect = Effect.runPromise(channel.nextEffect("message"));

    channel.publish("count", 3);
    channel.publish("message", "next");

    await expect(oncePromise).resolves.toBe(3);
    await expect(nextEffect).resolves.toBe("next");
  });

  it("clears specific and global listeners", () => {
    const channel = createEventChannel<TestEvents>();
    const received: string[] = [];
    const offMessage = channel.subscribe("message", (value) => {
      received.push(value);
    });
    const offAll = channel.subscribeAll((event) => {
      if (event.type === "message") {
        received.push(event.payload);
      }
    });

    channel.publish("message", "first");
    channel.clear("message");
    channel.publish("message", "second");
    expect(received).toEqual(["first", "first", "second"]);

    channel.clear();
    channel.publish("message", "third");
    expect(received).toEqual(["first", "first", "second"]);

    offMessage();
    offAll();
  });
});
