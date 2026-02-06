import { describe, expect, it } from "vitest";
import { createExternalStore } from "../internal/externalStore";

describe("external store", () => {
  it("subscribes and updates snapshots", () => {
    const store = createExternalStore(0);
    let seen = -1;
    const unsubscribe = store.subscribe(() => {
      seen = store.getSnapshot();
    });

    store.setSnapshot(2);

    expect(store.getSnapshot()).toBe(2);
    expect(seen).toBe(2);
    unsubscribe();
    unsubscribe();
    expect(store.listenerCount()).toBe(0);
  });

  it("supports listener mutation during notify", () => {
    const store = createExternalStore(0);
    const events: string[] = [];

    const unsubscribeFirst = store.subscribe(() => {
      events.push("first");
      unsubscribeFirst();
      store.subscribe(() => {
        events.push("third");
      });
    });

    const unsubscribeSecond = store.subscribe(() => {
      events.push("second");
      unsubscribeSecond();
    });

    store.notify();
    store.notify();

    expect(events).toEqual(["first", "second", "third"]);
  });
});
