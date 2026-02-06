import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  createFetchServerActionTransport,
  createServerActionHttpHandler,
  callServerAction,
  defineServerAction,
} from "../server";
import {
  createServerHydrationScript,
  ServerRenderDefectError,
  ServerRenderFailureError,
  renderEffectToReadableStream,
  renderEffectToString,
} from "../server";
import { parseFrameworkHydrationState } from "../ssr";
import { QueryCache } from "../query/QueryCache";

const normalizeChunk = (value: unknown): Uint8Array => {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array();
};

const readStreamAsText = async (stream: ReadableStream<unknown>): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    output += decoder.decode(normalizeChunk(next.value), { stream: true });
  }
  output += decoder.decode();
  return output;
};

describe("server http + ssr", () => {
  it("handles action HTTP method/path/body branches", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const action = defineServerAction({
      name: "echo",
      run: (input: { readonly value: string }) => Effect.succeed({ echoed: input.value }),
    });

    const handler = createServerActionHttpHandler({
      runtime,
      actions: [action],
      basePath: "/actions",
    });

    const methodResponse = await handler(
      new Request("https://example.test/actions/echo", { method: "GET" }),
    );
    expect(methodResponse.status).toBe(405);

    const notFoundResponse = await handler(
      new Request("https://example.test/other/echo", { method: "POST" }),
    );
    expect(notFoundResponse.status).toBe(404);

    const badJsonResponse = await handler(
      new Request("https://example.test/actions/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad",
      }),
    );
    expect(badJsonResponse.status).toBe(400);

    const badPayloadResponse = await handler(
      new Request("https://example.test/actions/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(123),
      }),
    );
    expect(badPayloadResponse.status).toBe(400);

    const successResponse = await handler(
      new Request("https://example.test/actions/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "ok" } }),
      }),
    );
    expect(successResponse.status).toBe(200);
    await expect(successResponse.json()).resolves.toEqual({
      _tag: "success",
      value: { echoed: "ok" },
    });

    const unknownResponse = await handler(
      new Request("https://example.test/actions/unknown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "ok" } }),
      }),
    );
    await expect(unknownResponse.json()).resolves.toEqual({
      _tag: "defect",
      message: "Unknown server action: unknown",
    });

    await runtime.dispose();
  });

  it("handles fetch transport success and failure branches", async () => {
    const successTransport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions",
      fetcher: async () =>
        new Response(JSON.stringify({ _tag: "success", value: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const successAction = defineServerAction({
      name: "ok",
      run: (_input: { readonly v: string }) => Effect.succeed({ ok: true }),
    });

    const value = await Effect.runPromise(
      callServerAction(successTransport, successAction, { v: "x" }),
    );
    expect(value.ok).toBe(true);

    const badStatusTransport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions",
      fetcher: async () => new Response("no", { status: 500 }),
    });

    await expect(
      Effect.runPromise(callServerAction(badStatusTransport, successAction, { v: "x" })),
    ).rejects.toThrow(/Server action transport failed|status/);

    const badPayloadTransport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions",
      fetcher: async () =>
        new Response(JSON.stringify({ nope: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(
      Effect.runPromise(callServerAction(badPayloadTransport, successAction, { v: "x" })),
    ).rejects.toThrow(/valid wire result|transport failed/);

    const defectTransport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions",
      fetcher: async () =>
        new Response(JSON.stringify({ _tag: "defect", message: "boom" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(
      Effect.runPromise(callServerAction(defectTransport, successAction, { v: "x" })),
    ).rejects.toThrow(/boom/);
  });

  it("renders SSR effects to string and stream", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const signal = new AbortController().signal;

    await expect(
      renderEffectToString(runtime, Effect.succeed(<div>hello</div>), { signal }),
    ).resolves.toContain("hello");

    const stream = await renderEffectToReadableStream(runtime, Effect.succeed(<div>stream</div>), {
      signal,
    });
    await expect(readStreamAsText(stream)).resolves.toContain("stream");

    await expect(renderEffectToString(runtime, Effect.fail("failed"))).rejects.toBeInstanceOf(
      ServerRenderFailureError,
    );
    await expect(renderEffectToString(runtime, Effect.die("defect"))).rejects.toBeInstanceOf(
      ServerRenderDefectError,
    );

    await expect(
      renderEffectToReadableStream(runtime, Effect.die("defect")),
    ).rejects.toBeInstanceOf(ServerRenderDefectError);
    await expect(
      renderEffectToReadableStream(runtime, Effect.fail("failed")),
    ).rejects.toBeInstanceOf(ServerRenderFailureError);

    await runtime.dispose();
  });

  it("creates hydration script with query and loader state", () => {
    const cache = new QueryCache();
    cache.setQueryData(["profile"], { id: "u1" });

    const script = createServerHydrationScript({
      cache,
      loaderState: {
        profile: {
          _tag: "success",
          value: { id: "u1" },
        },
      },
      globalName: "__TEST_STATE__",
    });

    expect(script).toContain("__TEST_STATE__");
    const serialized = script.slice(script.indexOf("=") + 1, script.lastIndexOf(";"));
    const decoded = parseFrameworkHydrationState(serialized);
    expect(decoded?.loaderState["profile"]).toEqual({
      _tag: "success",
      value: { id: "u1" },
    });
  });
});
