import { Cause, Effect, Exit } from "effect";
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

const normalizeError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

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

  const readEffect = (): Effect.Effect<string, Error, never> => {
    if (!clipboard) {
      const error = new Error("Clipboard API is not available");
      store.setSnapshot({ text: store.getSnapshot().text, error });
      return Effect.fail(error);
    }

    return Effect.tryPromise({
      try: () => clipboard.readText(),
      catch: normalizeError,
    }).pipe(
      Effect.tap((text) => Effect.sync(() => store.setSnapshot({ text, error: null }))),
      Effect.tapError((error) =>
        Effect.sync(() => store.setSnapshot({ text: store.getSnapshot().text, error })),
      ),
    );
  };

  const writeEffect = (value: string): Effect.Effect<void, Error, never> => {
    if (!clipboard) {
      const error = new Error("Clipboard API is not available");
      store.setSnapshot({ text: store.getSnapshot().text, error });
      return Effect.fail(error);
    }

    return Effect.tryPromise({
      try: () => clipboard.writeText(value),
      catch: normalizeError,
    }).pipe(
      Effect.tap(() => Effect.sync(() => store.setSnapshot({ text: value, error: null }))),
      Effect.tapError((error) =>
        Effect.sync(() => store.setSnapshot({ text: store.getSnapshot().text, error })),
      ),
      Effect.asVoid,
    );
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    refresh: () =>
      runEffectWithSquashedCause(
        readEffect().pipe(Effect.flatMap(() => Effect.sync(() => store.getSnapshot()))),
      ),
    read: () => runEffectWithSquashedCause(readEffect()),
    write: (value) => runEffectWithSquashedCause(writeEffect(value)),
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

  const refreshEffect = (): Effect.Effect<GeolocationSnapshot, never, never> => {
    if (!geolocation) {
      onFailure(new Error("Geolocation API is not available"));
      return Effect.succeed(store.getSnapshot());
    }

    return Effect.async<GeolocationSnapshot>((resume) => {
      geolocation.getCurrentPosition(
        (position) => {
          onSuccess(position);
          resume(Effect.succeed(store.getSnapshot()));
        },
        (error) => {
          onFailure(error);
          resume(Effect.succeed(store.getSnapshot()));
        },
        options.positionOptions,
      );
      return Effect.void;
    });
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
    refresh: () => runEffectWithSquashedCause(refreshEffect()),
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

  const queryEffect = (name: PermissionName): Effect.Effect<PermissionState, Error, never> => {
    if (!permissions) {
      const error = new Error("Permissions API is not available");
      store.setSnapshot({ states: store.getSnapshot().states, error });
      return Effect.fail(error);
    }

    return Effect.tryPromise({
      try: () => permissions.query({ name }),
      catch: normalizeError,
    }).pipe(
      Effect.tap((status) =>
        Effect.sync(() => {
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
        }),
      ),
      Effect.map((status) => status.state),
      Effect.tapError((error) =>
        Effect.sync(() => store.setSnapshot({ states: store.getSnapshot().states, error })),
      ),
    );
  };

  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      return () => {
        unsubscribe();
      };
    },
    refresh: () => runEffectWithSquashedCause(Effect.sync(() => store.getSnapshot())),
    query: (name) => runEffectWithSquashedCause(queryEffect(name)),
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

  const refreshEffect = (): Effect.Effect<NetworkStatusSnapshot, never, never> =>
    Effect.sync(() => {
      const online = target?.navigator.onLine ?? store.getSnapshot().online;
      store.setSnapshot({ online });
      return store.getSnapshot();
    });

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
    refresh: () => runEffectWithSquashedCause(refreshEffect()),
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

  const refreshEffect = (): Effect.Effect<VisibilitySnapshot, never, never> =>
    Effect.sync(() => {
      const next = target?.visibilityState ?? store.getSnapshot().visibilityState;
      store.setSnapshot({ visibilityState: next });
      return store.getSnapshot();
    });

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
    refresh: () => runEffectWithSquashedCause(refreshEffect()),
  };
};
