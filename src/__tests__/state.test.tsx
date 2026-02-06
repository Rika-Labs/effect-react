import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime, SubscriptionRef } from "effect";
import { useEffect, useRef } from "react";
import { EffectProvider } from "../provider/EffectProvider";
import { useDerived, useLocalSubscriptionRef, useSubscriptionRef } from "../state";
import { useComputed } from "../state/useComputed";

afterEach(() => {
  cleanup();
});

describe("state hooks", () => {
  it("reads and updates shared SubscriptionRef values", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(0));
    let api:
      | {
          readonly set: (value: number) => Promise<void>;
          readonly update: (updater: (value: number) => number) => Promise<void>;
        }
      | undefined;

    const Probe = () => {
      const state = useSubscriptionRef({
        ref,
        initial: 0,
      });
      api = {
        set: state.set,
        update: state.update,
      };
      return <div data-testid="value">{String(state.value)}</div>;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("value").textContent).toBe("0");

    await api!.set(1);
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("1");
    });

    await api!.update((value) => value + 1);
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("2");
    });

    view.unmount();
    await Effect.runPromise(SubscriptionRef.set(ref, 10));
    await runtime.dispose();
  });

  it("supports selector and equality suppression", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(0));
    let renders = 0;
    let setValue: ((value: number) => Promise<void>) | undefined;

    const Probe = () => {
      renders += 1;
      const state = useSubscriptionRef({
        ref,
        initial: 0,
        select: (value: number) => value % 2 === 0,
      });
      setValue = state.set;
      return <div data-testid="even">{String(state.value)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("even").textContent).toBe("true");
    const baseRenders = renders;

    await setValue!(2);
    await Promise.resolve();
    expect(renders).toBe(baseRenders);
    expect(screen.getByTestId("even").textContent).toBe("true");

    await setValue!(4);
    await Promise.resolve();
    expect(renders).toBe(baseRenders);
    await runtime.dispose();
  });

  it("creates and updates local SubscriptionRef", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let api:
      | {
          readonly ready: boolean;
          readonly set: (value: number) => Promise<void>;
          readonly update: (updater: (value: number) => number) => Promise<void>;
        }
      | undefined;

    const Probe = () => {
      const state = useLocalSubscriptionRef({
        initial: 1,
      });
      api = {
        ready: state.ready,
        set: state.set,
        update: state.update,
      };
      return (
        <div>
          <div data-testid="ready">{String(state.ready)}</div>
          <div data-testid="value">{String(state.value)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    await api!.set(5);
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("5");
    });

    await api!.update((value) => value + 1);
    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("6");
    });

    await runtime.dispose();
  });

  it("useComputed derives values from multiple SubscriptionRefs", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const refA = await Effect.runPromise(SubscriptionRef.make(2));
    const refB = await Effect.runPromise(SubscriptionRef.make(3));

    const Probe = () => {
      const sum = useComputed([refA, refB], [2, 3], (a: number, b: number) => a + b);
      return <div data-testid="sum">{String(sum)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("sum").textContent).toBe("5");

    await Effect.runPromise(SubscriptionRef.set(refA, 10));
    await waitFor(() => {
      expect(screen.getByTestId("sum").textContent).toBe("13");
    });

    await Effect.runPromise(SubscriptionRef.set(refB, 7));
    await waitFor(() => {
      expect(screen.getByTestId("sum").textContent).toBe("17");
    });

    await runtime.dispose();
  });

  it("useComputed suppresses updates when equals returns true", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(2));

    const Probe = () => {
      const parity = useComputed([ref], [2], (v: number) => v % 2 === 0, {
        equals: (a, b) => a === b,
      });
      return <div data-testid="parity">{String(parity)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("parity").textContent).toBe("true");
    await Effect.runPromise(SubscriptionRef.set(ref, 4));
    await new Promise((r) => setTimeout(r, 50));
    // Parity unchanged, should not trigger extra renders
    expect(screen.getByTestId("parity").textContent).toBe("true");

    await Effect.runPromise(SubscriptionRef.set(ref, 3));
    await waitFor(() => {
      expect(screen.getByTestId("parity").textContent).toBe("false");
    });

    await runtime.dispose();
  });

  it("useSubscriptionRef runs middlewares on set and update", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ref = await Effect.runPromise(SubscriptionRef.make(0));
    const log: string[] = [];
    let api:
      | {
          readonly set: (value: number) => Promise<void>;
          readonly update: (updater: (value: number) => number) => Promise<void>;
        }
      | undefined;

    const Probe = () => {
      const state = useSubscriptionRef({
        ref,
        initial: 0,
        middlewares: [
          {
            onSet: (next, prev) => {
              log.push(`${prev}->${next}`);
            },
          },
        ],
      });
      api = { set: state.set, update: state.update };
      return <div data-testid="val">{String(state.value)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await api!.set(5);
    await waitFor(() => {
      expect(screen.getByTestId("val").textContent).toBe("5");
    });
    expect(log).toContain("0->5");

    await api!.update((v) => v + 3);
    await waitFor(() => {
      expect(screen.getByTestId("val").textContent).toBe("8");
    });

    await runtime.dispose();
  });

  it("useLocalSubscriptionRef supports middlewares", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const log: string[] = [];
    let api:
      | {
          readonly set: (value: number) => Promise<void>;
          readonly update: (updater: (value: number) => number) => Promise<void>;
        }
      | undefined;

    const Probe = () => {
      const state = useLocalSubscriptionRef({
        initial: 10,
        middlewares: [
          {
            onSet: (next: number, prev: number) => {
              log.push(`${prev}->${next}`);
            },
          },
        ],
      });
      api = { set: state.set, update: state.update };
      return (
        <div>
          <div data-testid="ready">{String(state.ready)}</div>
          <div data-testid="val">{String(state.value)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    await api!.set(20);
    await waitFor(() => {
      expect(screen.getByTestId("val").textContent).toBe("20");
    });

    await api!.update((v) => v + 5);
    await waitFor(() => {
      expect(screen.getByTestId("val").textContent).toBe("25");
    });

    expect(log.length).toBeGreaterThan(0);
    await runtime.dispose();
  });

  it("useDerived preserves stable selected values with custom equality", () => {
    const seen: { readonly parity: number }[] = [];

    const Probe = ({ value }: { readonly value: number }) => {
      const derived = useDerived(value, (next) => ({ parity: next % 2 }), {
        equals: (left, right) => left.parity === right.parity,
      });
      const firstRef = useRef(derived);
      useEffect(() => {
        seen.push(derived);
      }, [derived]);
      return <div data-testid="same">{String(firstRef.current === derived)}</div>;
    };

    const view = render(<Probe value={2} />);
    expect(screen.getByTestId("same").textContent).toBe("true");

    view.rerender(<Probe value={4} />);
    expect(screen.getByTestId("same").textContent).toBe("true");

    view.rerender(<Probe value={5} />);
    expect(screen.getByTestId("same").textContent).toBe("false");

    expect(seen).toHaveLength(2);
  });
});
