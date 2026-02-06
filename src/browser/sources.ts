import {
  createExternalStore,
  type ExternalStore,
  type StoreListener,
} from "../internal/externalStore";

export interface HeadlessSource<T> {
  readonly getSnapshot: () => T;
  readonly subscribe: (listener: StoreListener) => () => void;
  readonly refresh: () => Promise<T>;
}

const createSource = <T>(initial: T): ExternalStore<T> => createExternalStore(initial);

export interface ClipboardSnapshot {
  readonly text: string | null;
  readonly error: Error | null;
}

export interface ClipboardSource extends HeadlessSource<ClipboardSnapshot> {
  readonly read: () => Promise<string>;
  readonly write: (value: string) => Promise<void>;
}

export interface ClipboardSourceOptions {
  readonly clipboard?: Pick<Clipboard, "readText" | "writeText"> | undefined;
}

export const createClipboardSource = (options: ClipboardSourceOptions = {}): ClipboardSource => {
  const clipboard =
    options.clipboard ?? (typeof navigator === "undefined" ? undefined : navigator.clipboard);
  const store = createSource<ClipboardSnapshot>({ text: null, error: null });

  const read = async (): Promise<string> => {
    if (!clipboard) {
      const error = new Error("Clipboard API is not available");
      store.setSnapshot({ text: store.getSnapshot().text, error });
      throw error;
    }
    try {
      const text = await clipboard.readText();
      store.setSnapshot({ text, error: null });
      return text;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      store.setSnapshot({ text: store.getSnapshot().text, error: normalized });
      throw normalized;
    }
  };

  const write = async (value: string): Promise<void> => {
    if (!clipboard) {
      const error = new Error("Clipboard API is not available");
      store.setSnapshot({ text: store.getSnapshot().text, error });
      throw error;
    }
    try {
      await clipboard.writeText(value);
      store.setSnapshot({ text: value, error: null });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      store.setSnapshot({ text: store.getSnapshot().text, error: normalized });
      throw normalized;
    }
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    refresh: async () => {
      await read();
      return store.getSnapshot();
    },
    read,
    write,
  };
};

export interface GeolocationSnapshot {
  readonly position: GeolocationPosition | null;
  readonly error: Error | null;
}

export interface GeolocationSource extends HeadlessSource<GeolocationSnapshot> {
  readonly start: () => () => void;
}

export interface GeolocationSourceOptions {
  readonly geolocation?: Geolocation | undefined;
  readonly positionOptions?: PositionOptions;
}

export const createGeolocationSource = (
  options: GeolocationSourceOptions = {},
): GeolocationSource => {
  const geolocation =
    options.geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
  const store = createSource<GeolocationSnapshot>({ position: null, error: null });

  const onSuccess = (position: GeolocationPosition) => {
    store.setSnapshot({ position, error: null });
  };

  const onFailure = (error: GeolocationPositionError | Error) => {
    const normalized = error instanceof Error ? error : new Error(error.message);
    store.setSnapshot({ position: store.getSnapshot().position, error: normalized });
  };

  const refresh = async (): Promise<GeolocationSnapshot> => {
    if (!geolocation) {
      onFailure(new Error("Geolocation API is not available"));
      return store.getSnapshot();
    }

    await new Promise<void>((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          onSuccess(position);
          resolve();
        },
        (error) => {
          onFailure(error);
          resolve();
        },
        options.positionOptions,
      );
    });

    return store.getSnapshot();
  };

  const start = () => {
    if (!geolocation) {
      onFailure(new Error("Geolocation API is not available"));
      return () => {};
    }

    const watchId = geolocation.watchPosition(onSuccess, onFailure, options.positionOptions);

    return () => {
      geolocation.clearWatch(watchId);
    };
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    refresh,
    start,
  };
};

export interface PermissionStateSnapshot {
  readonly states: Readonly<Record<string, PermissionState>>;
  readonly error: Error | null;
}

export interface PermissionsSource extends HeadlessSource<PermissionStateSnapshot> {
  readonly query: (name: PermissionName) => Promise<PermissionState>;
}

export interface PermissionsSourceOptions {
  readonly permissions?: Pick<Permissions, "query"> | undefined;
}

export const createPermissionsSource = (
  options: PermissionsSourceOptions = {},
): PermissionsSource => {
  const permissions =
    options.permissions ?? (typeof navigator === "undefined" ? undefined : navigator.permissions);
  const store = createSource<PermissionStateSnapshot>({ states: {}, error: null });

  const query = async (name: PermissionName): Promise<PermissionState> => {
    if (!permissions) {
      const error = new Error("Permissions API is not available");
      store.setSnapshot({ states: store.getSnapshot().states, error });
      throw error;
    }

    try {
      const status = await permissions.query({ name });
      const onChange = () => {
        const current = store.getSnapshot();
        store.setSnapshot({
          states: {
            ...current.states,
            [name]: status.state,
          },
          error: null,
        });
      };
      status.addEventListener("change", onChange);

      const current = store.getSnapshot();
      store.setSnapshot({
        states: {
          ...current.states,
          [name]: status.state,
        },
        error: null,
      });
      return status.state;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      store.setSnapshot({ states: store.getSnapshot().states, error: normalized });
      throw normalized;
    }
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      return () => {
        unsubscribe();
      };
    },
    refresh: async () => store.getSnapshot(),
    query,
  };
};

export interface NetworkStatusSnapshot {
  readonly online: boolean;
}

export interface NetworkStatusSource extends HeadlessSource<NetworkStatusSnapshot> {}

export interface NetworkStatusSourceOptions {
  readonly target?:
    | Pick<Window, "addEventListener" | "removeEventListener" | "navigator">
    | undefined;
}

export const createNetworkStatusSource = (
  options: NetworkStatusSourceOptions = {},
): NetworkStatusSource => {
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  const initial = target?.navigator.onLine ?? true;
  const store = createSource<NetworkStatusSnapshot>({ online: initial });

  const refresh = async (): Promise<NetworkStatusSnapshot> => {
    const online = target?.navigator.onLine ?? store.getSnapshot().online;
    store.setSnapshot({ online });
    return store.getSnapshot();
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      if (!target) {
        return unsubscribe;
      }
      const onOnline = () => {
        store.setSnapshot({ online: true });
      };
      const onOffline = () => {
        store.setSnapshot({ online: false });
      };
      target.addEventListener("online", onOnline);
      target.addEventListener("offline", onOffline);

      return () => {
        target.removeEventListener("online", onOnline);
        target.removeEventListener("offline", onOffline);
        unsubscribe();
      };
    },
    refresh,
  };
};

export interface VisibilitySnapshot {
  readonly visibilityState: DocumentVisibilityState;
}

export interface VisibilitySource extends HeadlessSource<VisibilitySnapshot> {}

export interface VisibilitySourceOptions {
  readonly target?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}

export const createVisibilitySource = (options: VisibilitySourceOptions = {}): VisibilitySource => {
  const target = options.target ?? (typeof document === "undefined" ? undefined : document);
  const initial = target?.visibilityState ?? "visible";
  const store = createSource<VisibilitySnapshot>({ visibilityState: initial });

  const refresh = async (): Promise<VisibilitySnapshot> => {
    const next = target?.visibilityState ?? store.getSnapshot().visibilityState;
    store.setSnapshot({ visibilityState: next });
    return store.getSnapshot();
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      if (!target) {
        return unsubscribe;
      }
      const onVisibilityChange = () => {
        store.setSnapshot({ visibilityState: target.visibilityState });
      };
      target.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        target.removeEventListener("visibilitychange", onVisibilityChange);
        unsubscribe();
      };
    },
    refresh,
  };
};
