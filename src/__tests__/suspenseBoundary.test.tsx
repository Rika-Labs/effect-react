import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Cause, Effect, FiberId, Layer, ManagedRuntime } from "effect";
import { Suspense } from "react";
import { EffectErrorBoundary } from "../error-boundary";
import { EffectProvider } from "../provider/EffectProvider";
import { QueryCache } from "../query/QueryCache";
import { SuspenseQueryError, useSuspenseQuery } from "../query/useSuspenseQuery";

const ThrowDefect = () => {
  throw new Error("defect");
};

const ThrowString = () => {
  throw "string-error";
};

const Crash = ({ crash }: { readonly crash: boolean }) => {
  if (crash) {
    throw new Error("broken");
  }
  return <div data-testid="ok">ok</div>;
};

afterEach(() => {
  cleanup();
});

describe("suspense query and error boundary", () => {
  it("reveals suspense query data after fallback", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let calls = 0;

    const Probe = () => {
      const query = useSuspenseQuery({
        key: ["suspense-success"],
        query: Effect.promise<string>(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                calls += 1;
                resolve("ready");
              }, 5);
            }),
        ),
      });
      return <div data-testid="value">{query.data}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Suspense fallback={<div data-testid="fallback">loading</div>}>
          <Probe />
        </Suspense>
      </EffectProvider>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("loading");

    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("ready");
    });

    expect(calls).toBe(1);
    await runtime.dispose();
  });

  it("throws suspense query failures into EffectErrorBoundary", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const Probe = () => {
      useSuspenseQuery({
        key: ["suspense-failure"],
        query: Effect.fail("boom"),
      });
      return <div data-testid="value">never</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <EffectErrorBoundary
          failureFallback={({ kind }) => <div data-testid="failure">{kind}</div>}
          fallback={<div data-testid="generic">generic</div>}
        >
          <Suspense fallback={<div data-testid="fallback">loading</div>}>
            <Probe />
          </Suspense>
        </EffectErrorBoundary>
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("failure").textContent).toBe("failure");
    });

    await runtime.dispose();
  });

  it("classifies interruption and defect boundary errors", () => {
    const interruption = new SuspenseQueryError(Cause.interrupt(FiberId.none));

    const ThrowInterruption = () => {
      throw interruption;
    };

    const interruptionView = render(
      <EffectErrorBoundary
        interruptionFallback={({ kind }) => <div data-testid="kind">{kind}</div>}
        defectFallback={({ kind }) => <div data-testid="kind">{kind}</div>}
      >
        <ThrowInterruption />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("kind").textContent).toBe("interruption");
    interruptionView.unmount();

    render(
      <EffectErrorBoundary defectFallback={({ kind }) => <div data-testid="kind">{kind}</div>}>
        <ThrowDefect />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("kind").textContent).toBe("defect");
  });

  it("resets boundary state when resetKeys change", async () => {
    const onReset = vi.fn();

    const view = render(
      <EffectErrorBoundary
        defectFallback={({ reset }) => (
          <button data-testid="reset" onClick={reset} type="button">
            reset
          </button>
        )}
        onReset={onReset}
        resetKeys={["a"]}
      >
        <Crash crash={true} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("reset").textContent).toBe("reset");

    view.rerender(
      <EffectErrorBoundary
        defectFallback={({ reset }) => (
          <button data-testid="reset" onClick={reset} type="button">
            reset
          </button>
        )}
        onReset={onReset}
        resetKeys={["b"]}
      >
        <Crash crash={false} />
      </EffectErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ok").textContent).toBe("ok");
    });

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("keeps error state when resetKeys identity is unchanged", async () => {
    const onReset = vi.fn();
    const keys = ["stable"] as const;

    const view = render(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
        resetKeys={keys}
      >
        <Crash crash={true} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");

    view.rerender(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
        resetKeys={keys}
      >
        <Crash crash={false} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");
    expect(onReset).not.toHaveBeenCalled();
  });

  it("keeps error state when resetKeys have equal values but different references", async () => {
    const view = render(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        resetKeys={["x", "y"]}
      >
        <Crash crash={true} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");

    view.rerender(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        resetKeys={["x", "y"]}
      >
        <Crash crash={false} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");
  });

  it("resets when resetKeys have different length", async () => {
    const onReset = vi.fn();
    const view = render(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
        resetKeys={["a"]}
      >
        <Crash crash={true} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");

    view.rerender(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
        resetKeys={["a", "b"]}
      >
        <Crash crash={false} />
      </EffectErrorBoundary>,
    );

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("resets when resetKeys transition from undefined to defined", async () => {
    const onReset = vi.fn();

    const view = render(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
      >
        <Crash crash={true} />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");

    view.rerender(
      <EffectErrorBoundary
        defectFallback={<div data-testid="fallback">fallback</div>}
        onReset={onReset}
        resetKeys={["next"]}
      >
        <Crash crash={false} />
      </EffectErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ok").textContent).toBe("ok");
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("renders node fallback and reports thrown non-error values", () => {
    const onError = vi.fn();

    render(
      <EffectErrorBoundary fallback={<div data-testid="node">node</div>} onError={onError}>
        <ThrowString />
      </EffectErrorBoundary>,
    );

    expect(screen.getByTestId("node").textContent).toBe("node");
    expect(onError).toHaveBeenCalledWith("string-error");
  });

  it("renders null when no fallback is configured", () => {
    const view = render(
      <EffectErrorBoundary>
        <ThrowDefect />
      </EffectErrorBoundary>,
    );

    expect(view.container.firstChild).toBeNull();
  });
});
