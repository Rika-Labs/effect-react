export type StoreListener = () => void;

export interface ExternalStore<T> {
  readonly getSnapshot: () => T;
  readonly subscribe: (listener: StoreListener) => () => void;
  readonly setSnapshot: (value: T) => void;
  readonly notify: () => void;
  readonly listenerCount: () => number;
}

export const createExternalStore = <T>(initialSnapshot: T): ExternalStore<T> => {
  let snapshot = initialSnapshot;
  const listeners = new Set<StoreListener>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        listeners.delete(listener);
      };
    },
    setSnapshot: (value) => {
      snapshot = value;
      const current = Array.from(listeners);
      for (const listener of current) {
        listener();
      }
    },
    notify: () => {
      const current = Array.from(listeners);
      for (const listener of current) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
};
