import { renderHook, waitFor } from "@testing-library/react";
import { Stream } from "effect";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createDevtoolsEventStream, useDevtoolsEvents, useEventStream } from "../../devtools";
import { type TelemetryEvent, createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";
import { EffectProvider } from "../../react";

const createRuntimeWrapper = (runtime: ReturnType<typeof createAppRuntime>) => {
  const Wrapper = ({ children }: { readonly children?: ReactNode }) =>
    createElement(EffectProvider, { runtime }, children);
  return Wrapper;
};

describe("devtools react module", () => {
  it("collects stream events and enforces the configured history limit", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [home] as const,
    });

    const { result, unmount } = renderHook(
      () => useEventStream(Stream.fromIterable([1, 2, 3]), { limit: 2 }),
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    try {
      await waitFor(() => {
        expect(result.current).toEqual([2, 3]);
      });
    } finally {
      unmount();
    }
  });

  it("skips subscriptions when disabled or when limit is zero", () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const disabledRuntime = createAppRuntime({
      routes: [home] as const,
    });
    const zeroLimitRuntime = createAppRuntime({
      routes: [home] as const,
    });

    const disabled = renderHook(
      () => useEventStream(Stream.fromIterable([1, 2, 3]), { enabled: false }),
      {
        wrapper: createRuntimeWrapper(disabledRuntime),
      },
    );

    const zeroLimit = renderHook(
      () => useEventStream(Stream.fromIterable([1, 2, 3]), { limit: 0 }),
      {
        wrapper: createRuntimeWrapper(zeroLimitRuntime),
      },
    );

    try {
      expect(disabled.result.current).toEqual([]);
      expect(zeroLimit.result.current).toEqual([]);
    } finally {
      disabled.unmount();
      zeroLimit.unmount();
    }
  });

  it("uses the devtools stream wrapper hook", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [home] as const,
    });

    const telemetryEvent: TelemetryEvent = {
      _tag: "query",
      phase: "success",
      key: "users.all",
      timestamp: 42,
    };

    const source = createDevtoolsEventStream({
      telemetry: Stream.fromIterable([telemetryEvent]),
    });

    const { result, unmount } = renderHook(() => useDevtoolsEvents(source), {
      wrapper: createRuntimeWrapper(runtime),
    });

    try {
      await waitFor(() => {
        expect(result.current).toEqual([
          {
            _tag: "telemetry",
            timestamp: 42,
            event: telemetryEvent,
          },
        ]);
      });
    } finally {
      unmount();
    }
  });
});
