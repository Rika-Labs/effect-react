import { describe, expect, it, vi } from "vitest";
import { onWindowFocus, onWindowReconnect } from "../query/focus";

describe("focus listeners", () => {
  it("noops when target is undefined", () => {
    const listener = vi.fn();

    const clearFocus = onWindowFocus(listener, undefined);
    const clearReconnect = onWindowReconnect(listener, undefined);

    expect(listener).not.toHaveBeenCalled();
    clearFocus();
    clearReconnect();
  });

  it("uses default window target when argument omitted", () => {
    const listener = vi.fn();
    const clearFocus = onWindowFocus(listener);
    const clearReconnect = onWindowReconnect(listener);
    clearFocus();
    clearReconnect();
  });

  it("noops with omitted target when window is unavailable", () => {
    const listener = vi.fn();
    const originalWindow = globalThis.window;

    vi.stubGlobal("window", undefined as unknown as Window);
    const clearFocus = onWindowFocus(listener);
    const clearReconnect = onWindowReconnect(listener);
    clearFocus();
    clearReconnect();
    vi.stubGlobal("window", originalWindow);

    expect(listener).not.toHaveBeenCalled();
  });

  it("attaches and detaches focus and reconnect listeners", () => {
    const listeners = new Map<string, Set<() => void>>();
    const addEventListener = vi.fn((event: string, listener: () => void) => {
      const set = listeners.get(event) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(event, set);
    });
    const removeEventListener = vi.fn((event: string, listener: () => void) => {
      const set = listeners.get(event);
      if (set) {
        set.delete(listener);
      }
    });
    const target = {
      addEventListener,
      removeEventListener,
    } as unknown as Window;

    const onFocus = vi.fn();
    const onReconnect = vi.fn();

    const clearFocus = onWindowFocus(onFocus, target);
    const clearReconnect = onWindowReconnect(onReconnect, target);

    listeners.get("focus")?.forEach((listener) => {
      listener();
    });
    listeners.get("online")?.forEach((listener) => {
      listener();
    });

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);

    clearFocus();
    clearReconnect();

    expect(removeEventListener).toHaveBeenCalledWith("focus", onFocus);
    expect(removeEventListener).toHaveBeenCalledWith("online", onReconnect);
  });
});
