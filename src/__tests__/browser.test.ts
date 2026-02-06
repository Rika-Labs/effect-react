import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClipboardSource,
  createGeolocationSource,
  createNetworkStatusSource,
  createPermissionsSource,
  createVisibilitySource,
} from "../browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

const createWindowTarget = (initialOnline: boolean) => {
  const listeners = new Map<string, Set<() => void>>();
  let online = initialOnline;
  const navigatorRef = {
    get onLine() {
      return online;
    },
  };
  const target = {
    navigator: navigatorRef,
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };

  const emit = (type: string) => {
    listeners.get(type)?.forEach((listener) => {
      listener();
    });
  };

  return {
    target: target as unknown as Pick<
      Window,
      "addEventListener" | "removeEventListener" | "navigator"
    >,
    emit,
    setOnline: (next: boolean) => {
      online = next;
    },
  };
};

const createDocumentTarget = (initial: DocumentVisibilityState) => {
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    visibilityState: initial,
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };

  const setVisibility = (next: DocumentVisibilityState) => {
    target.visibilityState = next;
    listeners.get("visibilitychange")?.forEach((listener) => {
      listener();
    });
  };

  return {
    target: target as unknown as Pick<
      Document,
      "visibilityState" | "addEventListener" | "removeEventListener"
    >,
    setVisibility,
  };
};

describe("browser sources", () => {
  it("supports clipboard read/write and missing clipboard errors", async () => {
    let value = "initial";
    const clipboard = {
      readText: vi.fn(async () => value),
      writeText: vi.fn(async (next: string) => {
        value = next;
      }),
    };

    const source = createClipboardSource({ clipboard });
    const snapshots: string[] = [];
    const unsubscribe = source.subscribe(() => {
      snapshots.push(source.getSnapshot().text ?? "");
    });

    await expect(source.read()).resolves.toBe("initial");
    await source.write("next");
    await expect(source.read()).resolves.toBe("next");

    expect(snapshots).toContain("next");
    unsubscribe();

    const missing = createClipboardSource({
      clipboard: undefined,
    });
    await expect(missing.read()).rejects.toBeInstanceOf(Error);
  });

  it("handles clipboard refresh and write/read failures", async () => {
    const readError = new Error("read failed");
    const writeError = new Error("write failed");
    const clipboard = {
      readText: vi.fn(async () => {
        throw readError;
      }),
      writeText: vi.fn(async () => {
        throw writeError;
      }),
    };

    const source = createClipboardSource({ clipboard });
    await expect(source.refresh()).rejects.toBe(readError);
    await expect(source.write("next")).rejects.toBe(writeError);
    expect(source.getSnapshot().error).toBe(writeError);
  });

  it("tracks geolocation refresh and watch updates", async () => {
    const position = {
      coords: {
        latitude: 1,
        longitude: 2,
        altitude: null,
        accuracy: 1,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: 1,
    } as GeolocationPosition;

    let watchSuccess: ((value: GeolocationPosition) => void) | undefined;
    const clearWatch = vi.fn((_id: number) => {});
    const geolocation = {
      getCurrentPosition: (success: PositionCallback, _error?: PositionErrorCallback | null) => {
        success(position);
      },
      watchPosition: (success: PositionCallback) => {
        watchSuccess = success;
        return 1;
      },
      clearWatch,
    } as Geolocation;

    const source = createGeolocationSource({ geolocation });
    await source.refresh();
    expect(source.getSnapshot().position).toEqual(position);

    const stop = source.start();
    watchSuccess?.({
      coords: position.coords,
      timestamp: 2,
      toJSON: () => ({
        coords: position.coords,
        timestamp: 2,
      }),
    });
    expect(source.getSnapshot().position?.timestamp).toBe(2);
    stop();
    expect(clearWatch).toHaveBeenCalledWith(1);

    const missing = createGeolocationSource({ geolocation: undefined });
    await missing.refresh();
    expect(missing.getSnapshot().error).toBeInstanceOf(Error);
  });

  it("handles geolocation failures and missing watch support", async () => {
    const geolocation = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.({
          code: 1,
          message: "denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as Geolocation;

    const source = createGeolocationSource({ geolocation });
    await source.refresh();
    expect(source.getSnapshot().error?.message).toBe("denied");

    const missing = createGeolocationSource({ geolocation: undefined });
    const stop = missing.start();
    stop();
    expect(missing.getSnapshot().error).toBeInstanceOf(Error);
  });

  it("queries permissions and updates on permission change", async () => {
    let permissionState: PermissionState = "prompt";
    let onChangeListener: EventListener | undefined;
    const status: PermissionStatus = {
      name: "geolocation",
      get state() {
        return permissionState;
      },
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          onChangeListener = listener;
        }
      },
      removeEventListener: () => {
        onChangeListener = undefined;
      },
      dispatchEvent: () => true,
      onpermissionchange: null,
    } as PermissionStatus;

    const permissions = {
      query: vi.fn(async () => status),
    };

    const source = createPermissionsSource({ permissions });
    await expect(source.query("geolocation")).resolves.toBe("prompt");

    permissionState = "granted";
    onChangeListener?.(new Event("change"));
    expect(source.getSnapshot().states["geolocation"]).toBe("granted");

    const missing = createPermissionsSource({ permissions: undefined });
    await expect(missing.query("geolocation")).rejects.toBeInstanceOf(Error);
  });

  it("handles permission query failures and supports subscription/refresh", async () => {
    const source = createPermissionsSource({
      permissions: {
        query: vi.fn(async () => {
          throw new Error("permissions-failed");
        }),
      },
    });

    const unsubscribe = source.subscribe(() => {});
    await expect(source.query("camera")).rejects.toBeInstanceOf(Error);
    await expect(source.refresh()).resolves.toEqual(source.getSnapshot());
    unsubscribe();
  });

  it("tracks network online and offline transitions", async () => {
    const { target, emit, setOnline } = createWindowTarget(false);
    const source = createNetworkStatusSource({ target });

    const snapshots: boolean[] = [];
    const unsubscribe = source.subscribe(() => {
      snapshots.push(source.getSnapshot().online);
    });

    expect(source.getSnapshot().online).toBe(false);
    emit("online");
    emit("offline");

    expect(snapshots).toEqual([true, false]);

    setOnline(true);
    await expect(source.refresh()).resolves.toEqual({ online: true });
    unsubscribe();
  });

  it("tracks visibility changes", async () => {
    const { target, setVisibility } = createDocumentTarget("visible");
    const source = createVisibilitySource({ target });
    const snapshots: DocumentVisibilityState[] = [];

    const unsubscribe = source.subscribe(() => {
      snapshots.push(source.getSnapshot().visibilityState);
    });

    expect(source.getSnapshot().visibilityState).toBe("visible");
    setVisibility("hidden");
    expect(snapshots).toEqual(["hidden"]);

    await expect(source.refresh()).resolves.toEqual({ visibilityState: "hidden" });
    unsubscribe();
  });

  it("supports network and visibility sources without browser globals", async () => {
    const network = createNetworkStatusSource({ target: undefined });
    const offNetwork = network.subscribe(() => {});
    await expect(network.refresh()).resolves.toEqual({ online: true });
    offNetwork();

    const visibility = createVisibilitySource();
    const offVisibility = visibility.subscribe(() => {});
    await expect(visibility.refresh()).resolves.toEqual({ visibilityState: "visible" });
    offVisibility();
  });

  it("covers fallback globals and non-Error normalization branches", async () => {
    let clipboardValue = "from-navigator";
    const navigatorClipboard = {
      readText: vi.fn(async () => clipboardValue),
      writeText: vi.fn(async (value: string) => {
        clipboardValue = value;
      }),
    };

    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 5,
            longitude: 6,
            altitude: null,
            accuracy: 1,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: 10,
        } as GeolocationPosition);
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as Geolocation;

    const permissions = {
      query: vi.fn(async () => {
        throw "not-an-error";
      }),
    };

    vi.stubGlobal("navigator", {
      clipboard: navigatorClipboard,
      geolocation,
      permissions,
      onLine: true,
    } as unknown as Navigator);

    const clipboardFallback = createClipboardSource();
    await expect(clipboardFallback.read()).resolves.toBe("from-navigator");
    await clipboardFallback.write("updated");
    await expect(clipboardFallback.refresh()).resolves.toEqual({
      text: "updated",
      error: null,
    });

    const geolocationFallback = createGeolocationSource();
    await geolocationFallback.refresh();
    expect(geolocationFallback.getSnapshot().position?.timestamp).toBe(10);

    const permissionsFallback = createPermissionsSource();
    await expect(permissionsFallback.query("microphone")).rejects.toBeInstanceOf(Error);

    const throwingClipboard = createClipboardSource({
      clipboard: {
        readText: vi.fn(async () => {
          throw "clipboard-read";
        }),
        writeText: vi.fn(async () => {
          throw "clipboard-write";
        }),
      },
    });
    await expect(throwingClipboard.read()).rejects.toBeInstanceOf(Error);
    await expect(throwingClipboard.write("x")).rejects.toBeInstanceOf(Error);

    vi.stubGlobal("navigator", undefined as unknown as Navigator);
    const missingClipboard = createClipboardSource();
    await expect(missingClipboard.write("x")).rejects.toBeInstanceOf(Error);
  });

  it("covers window/document fallback branches when globals are absent", async () => {
    vi.stubGlobal("window", undefined as unknown as Window);
    vi.stubGlobal("document", undefined as unknown as Document);

    const network = createNetworkStatusSource();
    const stopNetwork = network.subscribe(() => {});
    await expect(network.refresh()).resolves.toEqual({ online: true });
    stopNetwork();

    const visibility = createVisibilitySource();
    const stopVisibility = visibility.subscribe(() => {});
    await expect(visibility.refresh()).resolves.toEqual({ visibilityState: "visible" });
    stopVisibility();
  });
});
