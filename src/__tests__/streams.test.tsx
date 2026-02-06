import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import {
  useEventSourceStream,
  usePollingStream,
  useWebSocketStream,
  type UseWebSocketStreamResult,
} from "../streams";
import { useStream } from "../streams/useStream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly withCredentials: boolean;
  readonly close = vi.fn(() => {});
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string, options?: { readonly withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials === true;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emitOpen(): void {
    this.listeners.get("open")?.forEach((listener) => {
      listener(new Event("open"));
    });
  }

  emitMessage(value: string): void {
    const event = new MessageEvent<string>("message", { data: value });
    this.listeners.get("message")?.forEach((listener) => {
      listener(event);
    });
  }

  emitError(): void {
    this.listeners.get("error")?.forEach((listener) => {
      listener(new Event("error"));
    });
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly send = vi.fn((_value: string) => {});
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.listeners.get("open")?.forEach((listener) => {
      listener(new Event("open"));
    });
  }

  emitMessage(value: string): void {
    const event = new MessageEvent("message", { data: value });
    this.listeners.get("message")?.forEach((listener) => {
      listener(event);
    });
  }

  emitError(): void {
    this.listeners.get("error")?.forEach((listener) => {
      listener(new Event("error"));
    });
  }

  emitClose(): void {
    this.readyState = 3;
    const event = new CloseEvent("close", { code: 1006, reason: "closed", wasClean: false });
    this.listeners.get("close")?.forEach((listener) => {
      listener(event);
    });
  }
}

const OriginalEventSource = globalThis.EventSource;
const OriginalWebSocket = globalThis.WebSocket;

afterEach(() => {
  vi.useRealTimers();
  FakeEventSource.instances = [];
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
  globalThis.EventSource = OriginalEventSource;
  globalThis.WebSocket = OriginalWebSocket;
  cleanup();
});

describe("stream primitives", () => {
  it("polls with retry backoff and interval scheduling", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    const messages: number[] = [];
    const errors: unknown[] = [];
    let calls = 0;

    const Probe = () => {
      usePollingStream<number>({
        interval: 10,
        backoff: { initial: 5, max: 5, factor: 2 },
        fetcher: () => {
          calls += 1;
          if (calls === 1) {
            return Promise.reject(new Error("fail"));
          }
          return Effect.succeed(calls);
        },
        onMessage: (value) => {
          messages.push(value);
        },
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await Promise.resolve();
    expect(errors).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();
    expect(messages).toEqual([2]);

    await vi.advanceTimersByTimeAsync(10);
    await Promise.resolve();
    expect(messages).toEqual([2, 3]);

    await runtime.dispose();
  });

  it("supports delayed polling, retry disabled, and explicit disable transitions", async () => {
    vi.useFakeTimers();
    const runtime = ManagedRuntime.make(Layer.empty);
    const errors: unknown[] = [];
    const messages: number[] = [];
    let calls = 0;

    const Probe = ({ enabled }: { readonly enabled: boolean }) => {
      usePollingStream<number>({
        enabled,
        immediate: false,
        interval: 10,
        retry: false,
        fetcher: () => {
          calls += 1;
          if (calls === 2) {
            return Promise.reject(new Error("poll-fail"));
          }
          return calls;
        },
        onMessage: (value) => {
          messages.push(value);
        },
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe enabled />
      </EffectProvider>,
    );

    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(messages).toEqual([1]);

    await vi.advanceTimersByTimeAsync(10);
    expect(errors).toHaveLength(1);
    expect(calls).toBe(2);

    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(2);

    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe enabled={false} />
      </EffectProvider>,
    );

    await runtime.dispose();
  });

  it("reports Effect-based polling failures", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const errors: unknown[] = [];

    const Probe = () => {
      usePollingStream<number>({
        interval: 10,
        retry: false,
        fetcher: () => Effect.fail("boom"),
        onMessage: () => {},
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    await runtime.dispose();
  });

  it("handles missing EventSource and reconnects after errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);

    const received: number[] = [];
    const errors: unknown[] = [];

    const Probe = () => {
      useEventSourceStream<number>({
        url: "/events",
        backoff: { initial: 5, max: 5 },
        parse: (value) => Number(value),
        onMessage: (value) => {
          received.push(value);
        },
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    const view = render(<Probe />);
    const first = FakeEventSource.instances[0]!;
    first.emitOpen();
    first.emitMessage("1");
    expect(received).toEqual([1]);

    first.emitError();
    await vi.advanceTimersByTimeAsync(6);
    const second = FakeEventSource.instances[1]!;
    second.emitMessage("2");
    expect(received).toEqual([1, 2]);
    expect(errors).toHaveLength(1);

    view.unmount();
    expect(first.close).toHaveBeenCalled();
    expect(second.close).toHaveBeenCalled();

    vi.stubGlobal("EventSource", undefined as unknown as typeof EventSource);
    await act(async () => {
      render(<Probe />);
    });
    expect(errors.length).toBeGreaterThan(1);
  });

  it("supports EventSource credentials, no-reconnect mode, and disable cleanup", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);

    const opened: number[] = [];
    const received: string[] = [];
    const errors: unknown[] = [];

    const Probe = ({ enabled }: { readonly enabled: boolean }) => {
      useEventSourceStream<string>({
        enabled,
        url: "/events-auth",
        reconnect: false,
        withCredentials: true,
        onOpen: () => {
          opened.push(1);
        },
        onMessage: (value) => {
          received.push(value);
        },
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    const view = render(<Probe enabled />);
    const first = FakeEventSource.instances[0]!;
    expect(first.withCredentials).toBe(true);

    first.emitOpen();
    first.emitMessage("raw");
    expect(opened).toHaveLength(1);
    expect(received).toEqual(["raw"]);

    first.emitError();
    await vi.advanceTimersByTimeAsync(20);
    expect(errors).toHaveLength(1);
    expect(FakeEventSource.instances).toHaveLength(1);

    view.rerender(<Probe enabled={false} />);
    expect(first.close).toHaveBeenCalled();
  });

  it("manages websocket connection lifecycle and send behavior", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    let api: UseWebSocketStreamResult | undefined;
    const messages: string[] = [];

    const Probe = () => {
      api = useWebSocketStream<string>({
        url: "ws://localhost",
        backoff: { initial: 0, max: 0 },
        onMessage: (value) => {
          messages.push(value);
        },
      });
      return null;
    };

    const view = render(<Probe />);
    const first = FakeWebSocket.instances[0]!;

    expect(api!.send("before-open")).toBe(false);
    await act(async () => {
      first.emitOpen();
    });
    await waitFor(() => {
      expect(api!.connected).toBe(true);
    });

    await act(async () => {
      first.emitMessage("hello");
    });
    expect(messages).toEqual(["hello"]);

    expect(api!.send("outbound")).toBe(true);
    expect(first.send).toHaveBeenCalledWith("outbound");

    await act(async () => {
      first.emitClose();
    });
    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
    const second = FakeWebSocket.instances[1]!;
    await act(async () => {
      second.emitOpen();
    });
    expect(api!.connected).toBe(true);
    view.unmount();
    expect(second.close).toHaveBeenCalled();
  });

  it("handles websocket errors, close callbacks, and disabled mode without reconnect", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

    const opened: number[] = [];
    const errors: unknown[] = [];
    const closedCodes: number[] = [];
    const received: number[] = [];
    let api: UseWebSocketStreamResult | undefined;

    const Probe = ({ enabled }: { readonly enabled: boolean }) => {
      api = useWebSocketStream<number>({
        enabled,
        url: "ws://localhost/typed",
        reconnect: false,
        parse: (value) => Number(value),
        onOpen: () => {
          opened.push(1);
        },
        onMessage: (value) => {
          received.push(value);
        },
        onError: (error) => {
          errors.push(error);
        },
        onClose: (event) => {
          closedCodes.push(event.code);
        },
      });
      return null;
    };

    const view = render(<Probe enabled />);
    const first = FakeWebSocket.instances[0]!;

    first.emitOpen();
    await waitFor(() => {
      expect(api!.connected).toBe(true);
    });
    expect(opened).toHaveLength(1);

    first.emitMessage("7");
    expect(received).toEqual([7]);

    first.emitError();
    expect(errors).toHaveLength(1);

    first.emitClose();
    await waitFor(() => {
      expect(api!.connected).toBe(false);
    });
    expect(closedCodes).toEqual([1006]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(api!.send("after-close")).toBe(false);

    view.rerender(<Probe enabled={false} />);
    expect(first.close).toHaveBeenCalled();
  });

  it("reports missing WebSocket support", async () => {
    vi.stubGlobal("WebSocket", undefined as unknown as typeof WebSocket);
    const errors: unknown[] = [];

    const Probe = () => {
      useWebSocketStream<string>({
        url: "ws://localhost/missing",
        onMessage: () => {},
        onError: (error) => {
          errors.push(error);
        },
      });
      return null;
    };

    render(<Probe />);
    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });
  });
});

describe("useStream", () => {
  it("subscribes to an Effect Stream and receives values", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const stream = Stream.fromEffect(Effect.succeed(42));

    const Probe = () => {
      const result = useStream({
        stream,
        initial: 0,
      });
      return (
        <div>
          <div data-testid="stream-value">{String(result.value)}</div>
          <div data-testid="stream-done">{String(result.done)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("stream-done").textContent).toBe("true");
    });
    expect(screen.getByTestId("stream-value").textContent).toBe("42");

    await runtime.dispose();
  });

  it("reports errors via error field", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const errorStream = Stream.concat(
      Stream.fromEffect(Effect.succeed(1)),
      Stream.fail("stream-error"),
    );

    const Probe = () => {
      const result = useStream<number, string>({
        stream: errorStream,
        initial: 0,
      });
      return (
        <div>
          <div data-testid="stream-value">{String(result.value)}</div>
          <div data-testid="stream-error">{result.error ? "has-error" : "no-error"}</div>
          <div data-testid="stream-done">{String(result.done)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("stream-done").textContent).toBe("true");
    });
    expect(screen.getByTestId("stream-error").textContent).toBe("has-error");

    await runtime.dispose();
  });

  it("supports select option to transform values", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const stream = Stream.fromEffect(Effect.succeed(15));

    const Probe = () => {
      const result = useStream({
        stream,
        initial: "",
        select: (n: number) => `val-${n}`,
      });
      return <div data-testid="stream-selected">{result.value}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("stream-selected").textContent).toBe("val-15");
    });

    await runtime.dispose();
  });

  it("supports custom equals to suppress re-renders", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const stream = Stream.fromEffect(Effect.succeed(3));

    const Probe = () => {
      const result = useStream({
        stream,
        initial: true,
        select: (n: number) => n % 2 === 0,
        equals: (a, b) => a === b,
      });
      return <div data-testid="stream-even">{String(result.value)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("stream-even").textContent).toBe("false");
    });

    await runtime.dispose();
  });
});
