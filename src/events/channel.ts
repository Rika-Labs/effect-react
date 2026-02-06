import { Effect, type Effect as EffectType } from "effect";

export type EventEnvelope<Events extends object> = {
  readonly [K in keyof Events]: { readonly type: K; readonly payload: Events[K] };
}[keyof Events];

export interface EventChannelOptions {
  readonly onListenerError?: (error: unknown, type: PropertyKey) => void;
}

export interface EventChannel<Events extends object> {
  readonly publish: <K extends keyof Events>(type: K, payload: Events[K]) => void;
  readonly publishEffect: <K extends keyof Events>(
    type: K,
    payload: Events[K],
  ) => EffectType.Effect<void>;
  readonly subscribe: <K extends keyof Events>(
    type: K,
    listener: (payload: Events[K]) => void,
  ) => () => void;
  readonly subscribeAll: (listener: (event: EventEnvelope<Events>) => void) => () => void;
  readonly subscribePattern: (
    pattern: string,
    listener: (event: EventEnvelope<Events>) => void,
  ) => () => void;
  readonly once: <K extends keyof Events>(type: K) => Promise<Events[K]>;
  readonly nextEffect: <K extends keyof Events>(type: K) => EffectType.Effect<Events[K]>;
  readonly clear: (type?: keyof Events) => void;
  readonly listenerCount: (type?: keyof Events) => number;
}

const patternToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
};

export const createEventChannel = <Events extends object>(
  options?: EventChannelOptions,
): EventChannel<Events> => {
  const listeners = new Map<keyof Events, Set<(payload: unknown) => void>>();
  const allListeners = new Set<(event: EventEnvelope<Events>) => void>();

  const safeCall = <T>(fn: () => T, type: PropertyKey): void => {
    try {
      fn();
    } catch (error) {
      options?.onListenerError?.(error, type);
    }
  };

  const publish = <K extends keyof Events>(type: K, payload: Events[K]): void => {
    const bucket = listeners.get(type);
    if (bucket) {
      for (const listener of Array.from(bucket)) {
        safeCall(() => listener(payload), type);
      }
    }
    const envelope = { type, payload } as EventEnvelope<Events>;
    for (const listener of Array.from(allListeners)) {
      safeCall(() => listener(envelope), type);
    }
  };

  const subscribe = <K extends keyof Events>(type: K, listener: (payload: Events[K]) => void) => {
    const wrapped = (payload: unknown) => {
      listener(payload as Events[K]);
    };
    const existing = listeners.get(type) ?? new Set<(payload: unknown) => void>();
    existing.add(wrapped);
    listeners.set(type, existing);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const current = listeners.get(type);
      current?.delete(wrapped);
      if (current && current.size === 0) {
        listeners.delete(type);
      }
    };
  };

  const subscribeAll = (listener: (event: EventEnvelope<Events>) => void) => {
    allListeners.add(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      allListeners.delete(listener);
    };
  };

  const subscribePattern = (pattern: string, listener: (event: EventEnvelope<Events>) => void) => {
    const regex = patternToRegex(pattern);
    return subscribeAll((event) => {
      if (regex.test(String(event.type))) {
        listener(event);
      }
    });
  };

  const once = <K extends keyof Events>(type: K): Promise<Events[K]> =>
    new Promise<Events[K]>((resolve) => {
      const unsubscribe = subscribe(type, (payload) => {
        unsubscribe();
        resolve(payload);
      });
    });

  const nextEffect = <K extends keyof Events>(type: K): EffectType.Effect<Events[K]> =>
    Effect.promise(() => once(type));

  const clear = (type?: keyof Events): void => {
    if (type !== undefined) {
      listeners.delete(type);
      return;
    }
    listeners.clear();
    allListeners.clear();
  };

  const listenerCount = (type?: keyof Events): number => {
    if (type !== undefined) {
      return listeners.get(type)?.size ?? 0;
    }
    let total = allListeners.size;
    for (const bucket of listeners.values()) {
      total += bucket.size;
    }
    return total;
  };

  return {
    publish,
    publishEffect: (type, payload) =>
      Effect.sync(() => {
        publish(type, payload);
      }),
    subscribe,
    subscribeAll,
    subscribePattern,
    once,
    nextEffect,
    clear,
    listenerCount,
  };
};
