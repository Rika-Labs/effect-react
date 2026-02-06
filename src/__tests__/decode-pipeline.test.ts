import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { defineRoute } from "../router";
import {
  createRequestPipeline,
  decodeActionRequestPayload,
  decodeServerActionWireResult,
  defineRouteHandler,
  defineServerAction,
} from "../server";

describe("decode + pipeline", () => {
  it("decodes action payload and wire result deterministically", () => {
    expect(decodeActionRequestPayload({ input: { id: 1 } })).toEqual({
      _tag: "success",
      value: { input: { id: 1 } },
    });

    expect(decodeActionRequestPayload("bad")).toEqual({
      _tag: "failure",
      message: "Action payload must be an object",
    });

    expect(decodeServerActionWireResult({ _tag: "success", value: 1 })).toEqual({
      _tag: "success",
      value: { _tag: "success", value: 1 },
    });

    expect(decodeServerActionWireResult({ nope: true })).toEqual({
      _tag: "failure",
      message: "Server action response was not a valid wire result",
    });
  });

  it("routes action and route requests through unified pipeline", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const helloRoute = defineRoute({
      id: "hello",
      path: "/hello/:name",
    });

    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const helloHandler = defineRouteHandler({
      method: "GET",
      route: helloRoute,
      run: ({ params }) => Effect.succeed({ hello: params.name }),
    });

    const pipeline = createRequestPipeline({
      runtime,
      routes: [helloRoute] as const,
      actions: [ping],
      handlers: [helloHandler],
      actionBasePath: "/actions",
    });

    const actionResponse = await pipeline.handle(
      new Request("https://example.test/actions/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "ok" } }),
      }),
    );
    await expect(actionResponse.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "ok" },
    });

    const routeResponse = await pipeline.handle(
      new Request("https://example.test/hello/Rika", {
        method: "GET",
      }),
    );
    await expect(routeResponse.json()).resolves.toEqual({
      hello: "Rika",
    });

    await runtime.dispose();
  });
});
