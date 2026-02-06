import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRuntime } from "../provider/useRuntime";
import { EffectProvider } from "../provider/EffectProvider";
import type { AnyManagedRuntime } from "../internal/runtimeContext";
import { QueryCache } from "../query/QueryCache";
import { useQueryCache } from "../query/context";

const createRuntimeMock = (): AnyManagedRuntime => ({
  dispose: vi.fn(async () => {}),
  runPromiseExit: async () => {
    throw new Error("runPromiseExit should not be used in provider tests");
  },
});

describe("provider contexts", () => {
  it("throws when runtime context is missing", () => {
    const Probe = () => {
      useRuntime();
      return null;
    };
    expect(() => render(<Probe />)).toThrow("Missing EffectProvider runtime context");
  });

  it("throws when query cache context is missing", () => {
    const Probe = () => {
      useQueryCache();
      return null;
    };
    expect(() => render(<Probe />)).toThrow("Missing EffectProvider query cache context");
  });

  it("disposes runtime on unmount", () => {
    const runtime = createRuntimeMock();
    const view = render(
      <EffectProvider runtime={runtime}>
        <div>ok</div>
      </EffectProvider>,
    );
    view.unmount();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes previous runtime when runtime identity changes", () => {
    const runtimeOne = createRuntimeMock();
    const runtimeTwo = createRuntimeMock();

    const view = render(
      <EffectProvider runtime={runtimeOne}>
        <div>ok</div>
      </EffectProvider>,
    );

    view.rerender(
      <EffectProvider runtime={runtimeTwo}>
        <div>ok</div>
      </EffectProvider>,
    );

    expect(runtimeOne.dispose).toHaveBeenCalledTimes(1);
  });

  it("switches to a new cache instance when cache prop changes", () => {
    const runtime = createRuntimeMock();
    const cacheOne = new QueryCache();
    const cacheTwo = new QueryCache();
    let currentCache: QueryCache | null = null;

    const Probe = () => {
      currentCache = useQueryCache();
      return null;
    };

    const view = render(
      <EffectProvider runtime={runtime} cache={cacheOne}>
        <Probe />
      </EffectProvider>,
    );

    expect(currentCache).toBe(cacheOne);

    view.rerender(
      <EffectProvider runtime={runtime} cache={cacheTwo}>
        <Probe />
      </EffectProvider>,
    );

    expect(currentCache).toBe(cacheTwo);
  });
});
