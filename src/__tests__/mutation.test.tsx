import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { useEffect, useRef } from "react";
import { EffectProvider } from "../provider/EffectProvider";
import { QueryCache } from "../query/QueryCache";
import { useMutation } from "../mutation";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useMutation", () => {
  it("transitions pending to success and runs invalidation and callbacks", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache({ defaultStaleTime: 10_000 });
    cache.setQueryData(["items"], ["a"]);
    const entry = cache.ensureEntry<string[], never>({
      key: ["items"],
      staleTime: 10_000,
    });
    const events: string[] = [];

    const Probe = () => {
      const mutation = useMutation<{ readonly id: number }, string, never, never>({
        mutation: ({ id }) => Effect.succeed(`saved:${String(id)}`),
        invalidate: [["items"]],
        onSuccess: (value) => {
          events.push(`success:${value}`);
        },
        onSettled: (result) => {
          events.push(`settled:${result.status}`);
        },
      });
      const { mutate, status } = mutation;
      const startedRef = useRef(false);

      useEffect(() => {
        if (startedRef.current) {
          return;
        }
        startedRef.current = true;
        void mutate({ id: 1 });
      }, [mutate]);

      return <div data-testid="mutation-state">{status}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mutation-state").textContent).toBe("success");
    });

    expect(cache.getSnapshot(entry).isStale).toBe(true);
    expect(events).toEqual(["success:saved:1", "settled:success"]);

    await runtime.dispose();
  });

  it("transitions pending to failure and rolls back optimistic state", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    const events: string[] = [];
    let optimisticState = 0;

    const Probe = () => {
      const mutation = useMutation<number, string, string, never>({
        mutation: (value) =>
          Effect.fail(`boom:${String(value)}`).pipe(Effect.mapError((error) => error)),
        optimistic: {
          apply: (value) => {
            optimisticState = value;
            events.push(`apply:${String(value)}`);
          },
          rollback: (value, cause) => {
            optimisticState = 0;
            events.push(`rollback:${String(value)}:${String(Cause.isInterruptedOnly(cause))}`);
          },
        },
        onError: (cause) => {
          events.push(`error:${String(Cause.isInterruptedOnly(cause))}`);
        },
      });
      const { mutate, status } = mutation;
      const startedRef = useRef(false);

      useEffect(() => {
        if (startedRef.current) {
          return;
        }
        startedRef.current = true;
        void mutate(9);
      }, [mutate]);

      return <div data-testid="mutation-state">{status}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mutation-state").textContent).toBe("failure");
    });

    expect(optimisticState).toBe(0);
    expect(events).toEqual(["apply:9", "rollback:9:false", "error:false"]);

    await runtime.dispose();
  });

  it("interrupts previous mutation in same hook instance", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let firstResult: Exit.Exit<string, never> | undefined;
    let secondResult: Exit.Exit<string, never> | undefined;

    const Probe = () => {
      const mutation = useMutation<number, string, never, never>({
        mutation: (value) =>
          (value === 1
            ? Effect.succeed("first").pipe(Effect.andThen(Effect.never))
            : Effect.succeed("second")) as Effect.Effect<string, never, never>,
      });
      const { mutate, status } = mutation;
      const startedRef = useRef(false);

      useEffect(() => {
        if (startedRef.current) {
          return;
        }
        startedRef.current = true;
        void mutate(1).then((result) => {
          firstResult = result;
          return result;
        });
        void mutate(2).then((result) => {
          secondResult = result;
          return result;
        });
      }, [mutate]);

      return <div data-testid="mutation-state">{status}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mutation-state").textContent).toBe("success");
    });

    expect(secondResult).toBeDefined();
    expect(firstResult).toBeDefined();
    if (secondResult !== undefined) {
      expect(Exit.isSuccess(secondResult)).toBe(true);
    }
    if (firstResult !== undefined) {
      expect(Exit.isFailure(firstResult)).toBe(true);
      if (Exit.isFailure(firstResult)) {
        expect(Cause.isInterruptedOnly(firstResult.cause)).toBe(true);
      }
    }

    await runtime.dispose();
  });

  it("cancels in-flight mutation on unmount", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let interrupted = 0;

    const Probe = () => {
      const mutation = useMutation<void, string, never, never>({
        mutation: Effect.succeed("value").pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted += 1;
            }),
          ),
        ),
      });
      const { mutate, status } = mutation;
      const startedRef = useRef(false);

      useEffect(() => {
        if (startedRef.current) {
          return;
        }
        startedRef.current = true;
        void mutate(undefined);
      }, [mutate]);

      return <div data-testid="mutation-state">{status}</div>;
    };

    const view = render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mutation-state").textContent).toBe("pending");
    });

    view.unmount();
    await Promise.resolve();

    expect(interrupted).toBe(1);

    await runtime.dispose();
  });
});
