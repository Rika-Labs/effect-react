import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import { QueryCache } from "../query/QueryCache";
import { useQuery } from "../query/useQuery";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useQuery", () => {
  it("transitions to success", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const Probe = () => {
      const result = useQuery({
        key: ["value"],
        query: Effect.promise<string>(() => Promise.resolve("ready")),
      });
      return <div data-testid="state">{`${result.status}:${result.data ?? "-"}`}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("success:ready");
    });

    await runtime.dispose();
  });

  it("dedupes across concurrent subscribers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let calls = 0;

    const query = () =>
      Effect.promise<string>(() => {
        calls += 1;
        return new Promise((resolve) => {
          setTimeout(() => resolve("ok"), 10);
        });
      });

    const Probe = ({ id }: { id: string }) => {
      const result = useQuery({
        key: ["same-key"],
        query,
      });
      return <div data-testid={id}>{result.data ?? "-"}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe id="a" />
        <Probe id="b" />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("a").textContent).toBe("ok");
      expect(screen.getByTestId("b").textContent).toBe("ok");
    });

    expect(calls).toBe(1);
    await runtime.dispose();
  });

  it("supports placeholder and keepPreviousData", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const responses: Record<"one" | "two", string> = {
      one: "one-data",
      two: "two-data",
    };

    const Probe = ({ keyName }: { keyName: "one" | "two" }) => {
      const result = useQuery({
        key: ["entity", keyName],
        query: Effect.promise<string>(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(responses[keyName]), 5);
            }),
        ),
        placeholderData: "placeholder",
        keepPreviousData: true,
      });
      return <div data-testid="value">{result.data ?? "-"}</div>;
    };

    const Wrapper = ({ keyName }: { keyName: "one" | "two" }) => (
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe keyName={keyName} />
      </EffectProvider>
    );

    const view = render(<Wrapper keyName="one" />);

    expect(screen.getByTestId("value").textContent).toBe("placeholder");
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("one-data");
    });

    view.rerender(<Wrapper keyName="two" />);
    expect(screen.getByTestId("value").textContent).toBe("one-data");

    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("two-data");
    });

    view.unmount();
    await runtime.dispose();
  });

  it("refetches on focus and reconnect when stale", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let value = 0;

    const Probe = () => {
      const result = useQuery({
        key: ["focus"],
        staleTime: 0,
        query: () =>
          Effect.sync(() => {
            value += 1;
            return value;
          }),
      });
      return <div data-testid="value">{String(result.data ?? 0)}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("1");
    });

    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("2");
    });

    fireEvent(window, new Event("online"));
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("3");
    });

    await runtime.dispose();
  });

  it("does not auto-fetch when disabled", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let calls = 0;

    const Probe = () => {
      const result = useQuery({
        key: ["disabled"],
        enabled: false,
        query: Effect.sync(() => {
          calls += 1;
          return "x";
        }),
      });
      return <div data-testid="status">{result.status}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("status").textContent).toBe("initial");
    expect(calls).toBe(0);

    await runtime.dispose();
  });

  it("triggers stale remount refresh and skips fresh remount refresh", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let staleCalls = 0;
    let freshCalls = 0;

    const StaleProbe = () => {
      const result = useQuery({
        key: ["stale-remount"],
        staleTime: 10,
        query: Effect.sync(() => {
          staleCalls += 1;
          return staleCalls;
        }),
      });
      return <div data-testid="stale">{String(result.data ?? 0)}</div>;
    };

    const FreshProbe = () => {
      const result = useQuery({
        key: ["fresh-remount"],
        staleTime: 10_000,
        query: Effect.sync(() => {
          freshCalls += 1;
          return freshCalls;
        }),
      });
      return <div data-testid="fresh">{String(result.data ?? 0)}</div>;
    };

    const Host = ({ showStale, showFresh }: { showStale: boolean; showFresh: boolean }) => (
      <EffectProvider runtime={runtime} cache={cache}>
        {showStale ? <StaleProbe /> : null}
        {showFresh ? <FreshProbe /> : null}
      </EffectProvider>
    );

    const view = render(<Host showStale={true} showFresh={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("stale").textContent).toBe("1");
    });
    view.rerender(<Host showStale={false} showFresh={false} />);
    cache.invalidate(["stale-remount"]);

    view.rerender(<Host showStale={true} showFresh={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("stale").textContent).toBe("2");
    });

    view.rerender(<Host showStale={false} showFresh={true} />);

    await waitFor(() => {
      expect(screen.getByTestId("fresh").textContent).toBe("1");
    });
    view.rerender(<Host showStale={false} showFresh={false} />);

    view.rerender(<Host showStale={false} showFresh={true} />);

    await waitFor(() => {
      expect(screen.getByTestId("fresh").textContent).toBe("1");
    });

    expect(staleCalls).toBe(2);
    expect(freshCalls).toBe(1);
    await runtime.dispose();
  });
});
