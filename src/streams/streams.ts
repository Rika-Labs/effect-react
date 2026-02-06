import { Effect, Exit } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { toMillis, type DurationInput } from "../internal/duration";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { useRuntime } from "../provider/useRuntime";

export interface BackoffPolicy {
  readonly initial: DurationInput;
  readonly max: DurationInput;
  readonly factor?: number;
}

const defaultBackoff: BackoffPolicy = {
  initial: 250,
  max: 5_000,
  factor: 2,
};

const nextBackoff = (attempt: number, policy: BackoffPolicy): number => {
  const initial = toMillis(policy.initial);
  const max = toMillis(policy.max);
  const factor = policy.factor ?? 2;
  return Math.min(max, initial * factor ** attempt);
};

const readEventData = (event: Event): string => {
  const data = (event as { readonly data?: unknown }).data;
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "number" || typeof data === "boolean" || typeof data === "bigint") {
    return `${data}`;
  }
  return "";
};

export interface UsePollingStreamOptions<T> {
  readonly interval: DurationInput;
  readonly fetcher: () => T | Promise<T> | Effect.Effect<T, unknown, unknown>;
  readonly enabled?: boolean;
  readonly immediate?: boolean;
  readonly retry?: boolean;
  readonly backoff?: BackoffPolicy;
  readonly onMessage: (value: T) => void;
  readonly onError?: (error: unknown) => void;
}

export const usePollingStream = <T>(options: UsePollingStreamOptions<T>): void => {
  const runtime = useRuntime();
  const {
    interval,
    fetcher,
    enabled = true,
    immediate = true,
    retry = true,
    backoff = defaultBackoff,
    onMessage,
    onError,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleRef = useRef<EffectRunHandle<T, unknown> | null>(null);
  const fetcherRef = useRef(fetcher);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const backoffRef = useRef(backoff);
  const intervalMs = toMillis(interval);

  fetcherRef.current = fetcher;
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  backoffRef.current = backoff;

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      handleRef.current?.cancel();
      handleRef.current = null;
      return;
    }

    let active = true;
    let attempt = 0;

    const schedule = (delay: number) => {
      timerRef.current = setTimeout(() => {
        run();
      }, delay);
    };

    const onSuccess = (value: T) => {
      attempt = 0;
      onMessageRef.current(value);
      if (active) {
        schedule(intervalMs);
      }
    };

    const onFailure = (error: unknown) => {
      onErrorRef.current?.(error);
      if (!active || !retry) {
        return;
      }
      schedule(nextBackoff(attempt, backoffRef.current));
      attempt += 1;
    };

    const run = () => {
      if (!active) {
        return;
      }
      handleRef.current?.cancel();
      handleRef.current = null;

      const outcome = fetcherRef.current();
      if (Effect.isEffect(outcome)) {
        const handle = runEffect(runtime, outcome as Effect.Effect<T, unknown, unknown>);
        handleRef.current = handle;
        void handle.promise.then((exit) => {
          handleRef.current = null;
          if (Exit.isSuccess(exit)) {
            onSuccess(exit.value);
            return undefined;
          }
          onFailure(exit.cause);
          return undefined;
        });
        return;
      }

      void Promise.resolve(outcome).then(onSuccess, onFailure);
    };

    if (immediate) {
      run();
    } else {
      schedule(intervalMs);
    }

    return () => {
      active = false;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [enabled, immediate, intervalMs, retry, runtime]);
};

export interface UseEventSourceStreamOptions<T> {
  readonly url: string;
  readonly enabled?: boolean;
  readonly reconnect?: boolean;
  readonly backoff?: BackoffPolicy;
  readonly withCredentials?: boolean;
  readonly parse?: (value: string) => T;
  readonly onMessage: (value: T) => void;
  readonly onOpen?: () => void;
  readonly onError?: (error: unknown) => void;
}

export const useEventSourceStream = <T = string>(options: UseEventSourceStreamOptions<T>): void => {
  const {
    url,
    enabled = true,
    reconnect = true,
    backoff = defaultBackoff,
    withCredentials,
    parse,
    onMessage,
    onOpen,
    onError,
  } = options;

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const parseRef = useRef(parse);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const backoffRef = useRef(backoff);

  parseRef.current = parse;
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onErrorRef.current = onError;
  backoffRef.current = backoff;

  useEffect(() => {
    if (!enabled) {
      sourceRef.current?.close();
      sourceRef.current = null;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      return;
    }

    if (typeof EventSource === "undefined") {
      onErrorRef.current?.(new Error("EventSource is not available"));
      return;
    }

    let attempt = 0;
    let active = true;

    const connect = () => {
      if (!active) {
        return;
      }

      const source =
        withCredentials === true
          ? new EventSource(url, { withCredentials: true })
          : new EventSource(url);
      sourceRef.current = source;

      const onSourceOpen = () => {
        attempt = 0;
        onOpenRef.current?.();
      };

      const onSourceMessage = (event: Event) => {
        const dataText = readEventData(event);
        const parseCurrent = parseRef.current;
        const data = parseCurrent ? parseCurrent(dataText) : (dataText as unknown as T);
        onMessageRef.current(data);
      };

      const onSourceError = (event: Event) => {
        onErrorRef.current?.(event);
        source.close();
        if (!active || !reconnect) {
          return;
        }
        const waitMs = nextBackoff(attempt, backoffRef.current);
        attempt += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, waitMs);
      };

      source.addEventListener("open", onSourceOpen);
      source.addEventListener("message", onSourceMessage);
      source.addEventListener("error", onSourceError);
    };

    connect();

    return () => {
      active = false;
      sourceRef.current?.close();
      sourceRef.current = null;
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
    };
  }, [enabled, reconnect, url, withCredentials]);
};

export interface UseWebSocketStreamOptions<T> {
  readonly url: string;
  readonly enabled?: boolean;
  readonly reconnect?: boolean;
  readonly backoff?: BackoffPolicy;
  readonly parse?: (value: string) => T;
  readonly onMessage: (value: T) => void;
  readonly onOpen?: () => void;
  readonly onClose?: (event: CloseEvent) => void;
  readonly onError?: (error: unknown) => void;
}

export interface UseWebSocketStreamResult {
  readonly connected: boolean;
  readonly send: (value: string) => boolean;
}

export const useWebSocketStream = <T = string>(
  options: UseWebSocketStreamOptions<T>,
): UseWebSocketStreamResult => {
  const {
    url,
    enabled = true,
    reconnect = true,
    backoff = defaultBackoff,
    parse,
    onMessage,
    onOpen,
    onClose,
    onError,
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const parseRef = useRef(parse);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const backoffRef = useRef(backoff);

  parseRef.current = parse;
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;
  backoffRef.current = backoff;

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      return;
    }

    if (typeof WebSocket === "undefined") {
      onErrorRef.current?.(new Error("WebSocket is not available"));
      return;
    }

    let attempt = 0;
    let active = true;

    const connect = () => {
      if (!active) {
        return;
      }

      const socket = new WebSocket(url);
      socketRef.current = socket;

      const onSocketOpen = () => {
        attempt = 0;
        setConnected(true);
        onOpenRef.current?.();
      };

      const onSocketMessage = (event: Event) => {
        const dataText = readEventData(event);
        const parseCurrent = parseRef.current;
        const data = parseCurrent ? parseCurrent(dataText) : (dataText as unknown as T);
        onMessageRef.current(data);
      };

      const onSocketError = (event: Event) => {
        onErrorRef.current?.(event);
      };

      const onSocketClose = (event: Event) => {
        setConnected(false);
        if (event instanceof CloseEvent) {
          onCloseRef.current?.(event);
        }
        if (!active || !reconnect) {
          return;
        }
        const waitMs = nextBackoff(attempt, backoffRef.current);
        attempt += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, waitMs);
      };

      socket.addEventListener("open", onSocketOpen);
      socket.addEventListener("message", onSocketMessage);
      socket.addEventListener("error", onSocketError);
      socket.addEventListener("close", onSocketClose);
    };

    connect();

    return () => {
      active = false;
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      if (reconnectTimerRef.current !== undefined) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
    };
  }, [enabled, reconnect, url]);

  const send = useCallback((value: string) => {
    const socket = socketRef.current;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(value);
    return true;
  }, []);

  return {
    connected,
    send,
  };
};
