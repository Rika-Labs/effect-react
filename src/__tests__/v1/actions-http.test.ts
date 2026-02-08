import { Effect, ManagedRuntime, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { AnyActionDefinition } from "../../actions";
import {
  ActionTransportError,
  callActionWire,
  createActionHttpHandler,
  createActionHttpHandlerEffect,
  defineAction,
} from "../../actions";
import {
  BoundaryDecodeError,
  BoundaryLive,
  BoundaryProtocolError,
  type Boundary,
} from "../../boundary";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";

const homeRoute = defineRoute({
  id: "home",
  path: "/",
});

const createRuntime = (actions: readonly AnyActionDefinition[] = []) =>
  createAppRuntime({
    routes: [homeRoute] as const,
    actions,
  });

const withActionRuntime = async <A>(
  actions: readonly AnyActionDefinition[],
  run: (runtime: ReturnType<typeof createAppRuntime>) => Promise<A>,
): Promise<A> => {
  const runtime = createRuntime(actions);
  try {
    return await run(runtime);
  } finally {
    await runtime.dispose();
  }
};

const withBoundaryRuntime = async <A>(
  run: (runtime: ManagedRuntime.ManagedRuntime<Boundary, never>) => Promise<A>,
): Promise<A> => {
  const runtime = ManagedRuntime.make(BoundaryLive);
  try {
    return await run(runtime);
  } finally {
    await runtime.dispose();
  }
};

const wireAction = defineAction({
  name: "action.wire.echo",
  input: Schema.Struct({ value: Schema.Number }),
  output: Schema.Struct({ value: Schema.Number }),
  error: Schema.Struct({ reason: Schema.String }),
  handler: ({ value }) => Effect.succeed({ value }),
});

describe("action http handler", () => {
  it("returns 405 for non-POST requests", async () => {
    const handleEffect = createActionHttpHandlerEffect();

    const response = await withActionRuntime([], (runtime) =>
      runtime.runPromise(
        handleEffect(new Request("https://example.test/actions", { method: "GET" })),
      ),
    );

    const body = (await response.json()) as { readonly error: string };

    expect(response.status).toBe(405);
    expect(body.error).toBe("Method Not Allowed");
  });

  it("dispatches action payloads and returns wire response", async () => {
    const increment = defineAction({
      name: "counter.increment.http",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ value }) => Effect.succeed({ value: value + 1 }),
    });

    const request = new Request("https://example.test/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: increment.name,
        input: { value: 9 },
      }),
    });

    const handleEffect = createActionHttpHandlerEffect();

    const response = await withActionRuntime([increment] as const, (runtime) =>
      runtime.runPromise(handleEffect(request)),
    );

    const body = (await response.json()) as {
      readonly _tag: string;
      readonly value?: { readonly value: number };
    };

    expect(response.status).toBe(200);
    expect(body._tag).toBe("success");
    expect(body.value).toEqual({ value: 10 });
  });

  it("returns 500 when request body cannot be read", async () => {
    const brokenRequest = {
      method: "POST",
      text: () => Promise.reject(new Error("stream-closed")),
    } as unknown as Request;

    const handleEffect = createActionHttpHandlerEffect();

    const response = await withActionRuntime([], (runtime) =>
      runtime.runPromise(handleEffect(brokenRequest)),
    );

    const body = (await response.json()) as { readonly error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to read request body");
  });

  it("returns 500 when request JSON decoding fails", async () => {
    const request = new Request("https://example.test/actions", {
      method: "POST",
      body: "{not-json}",
    });

    const handleEffect = createActionHttpHandlerEffect();

    const response = await withActionRuntime([], (runtime) =>
      runtime.runPromise(handleEffect(request)),
    );

    const body = (await response.json()) as { readonly error: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain("Boundary transport failed at action:http:request");
  });

  it("adapts effect handler to promise runtime with createActionHttpHandler", async () => {
    const increment = defineAction({
      name: "counter.increment.bridge",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ value }) => Effect.succeed({ value: value + 1 }),
    });

    const request = new Request("https://example.test/actions", {
      method: "POST",
      body: JSON.stringify({
        name: increment.name,
        input: { value: 4 },
      }),
    });

    let runtimeRunCalls = 0;

    const response = await withActionRuntime([increment] as const, async (runtime) => {
      const handler = createActionHttpHandler()((effect) => {
        runtimeRunCalls += 1;
        return runtime.runPromise(effect);
      });

      return handler(request);
    });

    const body = (await response.json()) as {
      readonly _tag: string;
      readonly value?: { readonly value: number };
    };

    expect(runtimeRunCalls).toBe(1);
    expect(response.status).toBe(200);
    expect(body._tag).toBe("success");
    expect(body.value).toEqual({ value: 5 });
  });
});

describe("callActionWire transport and decoding", () => {
  it("encodes input, posts wire payload, and decodes success output", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        _tag: "success",
        value: { value: 42 },
      }), {
        status: 200,
      }),
    );

    const output = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        callActionWire(wireAction, {
          endpoint: "https://example.test/actions",
          input: { value: 42 },
          fetcher,
        }),
      ),
    );

    expect(output).toEqual({ value: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const firstCall = fetcher.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) {
      expect(firstCall[0]).toBe("https://example.test/actions");
      const init = firstCall[1];
      expect(init?.method).toBe("POST");

      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("application/json");

      expect(typeof init?.body).toBe("string");
      if (typeof init?.body === "string") {
        const payload = JSON.parse(init.body) as {
          readonly name: string;
          readonly input: { readonly value: number };
        };

        expect(payload).toEqual({
          name: wireAction.name,
          input: { value: 42 },
        });
      }
    }
  });

  it("uses global fetch when custom fetcher is omitted and forwards signal", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        _tag: "success",
        value: { value: 8 },
      }), {
        status: 200,
      }),
    );

    const controller = new AbortController();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const output = await withBoundaryRuntime((runtime) =>
        runtime.runPromise(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 8 },
            signal: controller.signal,
          }),
        ),
      );

      expect(output).toEqual({ value: 8 });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      if (firstCall !== undefined) {
        const init = firstCall[1];
        expect(init?.signal).toBe(controller.signal);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("decodes failure payloads into typed action errors", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "failure",
        error: { reason: "blocked" },
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toEqual({ reason: "blocked" });
  });

  it("maps defect payloads to ActionTransportError", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "defect",
        message: "server-defect",
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(ActionTransportError);
    if (error instanceof ActionTransportError) {
      expect(error.message).toBe("server-defect");
    }
  });

  it("fails with ActionTransportError on non-OK response statuses", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(ActionTransportError);
    if (error instanceof ActionTransportError) {
      expect(error.message).toContain("status 503");
      expect(error.causeValue).toBe(503);
    }
  });

  it("fails with ActionTransportError when fetcher throws", async () => {
    const fetcher = vi.fn(async () => Promise.reject(new Error("network-down")));

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(ActionTransportError);
    if (error instanceof ActionTransportError) {
      expect(error.message).toContain(`Failed to call ${wireAction.name}`);
    }
  });

  it("fails with ActionTransportError when response body cannot be read", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        text: () => Promise.reject(new Error("unreadable-response")),
      }) as Response,
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(ActionTransportError);
    if (error instanceof ActionTransportError) {
      expect(error.message).toContain(
        `Failed to read response for ${wireAction.name}`,
      );
    }
  });

  it("fails with BoundaryDecodeError when wire payload shape is invalid", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "unknown",
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(BoundaryDecodeError);
    if (error instanceof BoundaryDecodeError) {
      expect(error.source).toBe(`action:${wireAction.name}:wire`);
    }
  });

  it("fails before fetch when client input encoding fails", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "success",
        value: { value: 1 },
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: "bad" } as unknown as { value: number },
            fetcher,
          }),
        ),
      ),
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(BoundaryProtocolError);
    if (error instanceof BoundaryProtocolError) {
      expect(error.source).toBe(`action:${wireAction.name}:client-input`);
    }
  });

  it("fails with BoundaryDecodeError when success payload cannot decode output", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "success",
        value: { value: "not-number" },
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(BoundaryDecodeError);
    if (error instanceof BoundaryDecodeError) {
      expect(error.source).toBe(`action:${wireAction.name}:client-output`);
    }
  });

  it("fails with BoundaryDecodeError when failure payload cannot decode error", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({
        _tag: "failure",
        error: { reason: 123 },
      }), {
        status: 200,
      }),
    );

    const error = await withBoundaryRuntime((runtime) =>
      runtime.runPromise(
        Effect.flip(
          callActionWire(wireAction, {
            endpoint: "https://example.test/actions",
            input: { value: 1 },
            fetcher,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(BoundaryDecodeError);
    if (error instanceof BoundaryDecodeError) {
      expect(error.source).toBe(`action:${wireAction.name}:client-error`);
    }
  });
});
