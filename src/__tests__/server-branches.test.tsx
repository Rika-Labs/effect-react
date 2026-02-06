import { describe, expect, it, vi } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { render, screen, waitFor } from "@testing-library/react";
import { EffectProvider } from "../provider";
import { createMemoryRouterHistory, defineRoute } from "../router";
import { defineApp } from "../framework";
import {
  ServerActionTransportError,
  createFetchServerActionTransport,
  createRequestScopedServerActionHttpHandler,
  createRequestScopedServerActionHttpHandlerEffect,
  createRouteRequestHandler,
  createRouteRequestHandlerEffect,
  createServerActionHttpDispatcher,
  createServerActionHttpHandler,
  createServerActionHttpHandlerEffect,
  createInMemoryServerActionTransport,
  createServerActionDispatcher,
  defineRouteHandler,
  defineServerAction,
  RequestContext,
  useServerAction,
} from "../server";
import type { InputSchema, ErrorTransportCodec } from "../server";

describe("server branches", () => {
  it("covers route handler success/failure/defect and 404 paths", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const okRoute = defineRoute({
      id: "ok",
      path: "/ok",
    });
    const failRoute = defineRoute({
      id: "fail",
      path: "/fail",
    });
    const defectRoute = defineRoute({
      id: "defect",
      path: "/defect",
    });

    const okHandler = defineRouteHandler({
      method: "GET",
      route: okRoute,
      run: () => Effect.succeed({ ok: true as const }),
      toResponse: (output) =>
        new Response(JSON.stringify(output), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    });

    const failureHandler = defineRouteHandler({
      method: "GET",
      route: failRoute,
      run: () => Effect.fail("failure"),
      onFailure: (error) =>
        new Response(JSON.stringify({ reason: error }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
    });

    const defectHandler = defineRouteHandler({
      method: "GET",
      route: defectRoute,
      run: () => Effect.die("defect"),
    });

    const requestHandler = createRouteRequestHandler(runtime, [
      okHandler,
      failureHandler,
      defectHandler,
    ]);

    const okResponse = await requestHandler(
      new Request("https://example.test/ok", { method: "GET" }),
    );
    expect(okResponse.status).toBe(201);
    await expect(okResponse.json()).resolves.toEqual({ ok: true });

    const failureResponse = await requestHandler(
      new Request("https://example.test/fail", { method: "GET" }),
    );
    expect(failureResponse.status).toBe(422);
    await expect(failureResponse.json()).resolves.toEqual({ reason: "failure" });

    const defectResponse = await requestHandler(
      new Request("https://example.test/defect", { method: "GET" }),
    );
    expect(defectResponse.status).toBe(500);
    const defectBody = (await defectResponse.json()) as {
      readonly error: { readonly defect: string };
    };
    expect(defectBody.error.defect).toContain("defect");

    const wrongMethodResponse = await requestHandler(
      new Request("https://example.test/ok", { method: "POST" }),
    );
    expect(wrongMethodResponse.status).toBe(404);

    const notFoundResponse = await requestHandler(
      new Request("https://example.test/missing", { method: "GET" }),
    );
    expect(notFoundResponse.status).toBe(404);

    await runtime.dispose();
  });

  it("covers route search parse defects in effect route handler", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const badSearchRoute = defineRoute({
      id: "bad-search",
      path: "/bad-search",
      search: {
        parse: () => {
          throw new Error("invalid-search");
        },
        serialize: () => new URLSearchParams(),
      },
    });

    const run = vi.fn(() => Effect.succeed({ ok: true as const }));
    const badHandler = defineRouteHandler({
      method: "GET",
      route: badSearchRoute,
      run,
    });

    const routeEffectHandler = createRouteRequestHandlerEffect(runtime, [badHandler]);
    const response = await Effect.runPromise(
      routeEffectHandler(new Request("https://example.test/bad-search?q=bad", { method: "GET" })),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { readonly error: { readonly defect: string } };
    expect(body.error.defect).toContain("invalid-search");
    expect(run).not.toHaveBeenCalled();

    await runtime.dispose();
  });

  it("normalizes action base paths and supports dispatcher alias", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const httpHandler = createServerActionHttpHandler({
      runtime,
      actions: [ping],
      basePath: "",
    });

    const baseResponse = await httpHandler(
      new Request("https://example.test/__effect/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "x" } }),
      }),
    );
    expect(baseResponse.status).toBe(404);

    const actionResponse = await httpHandler(
      new Request("https://example.test/__effect/actions/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "x" } }),
      }),
    );
    await expect(actionResponse.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "x" },
    });

    const dispatcher = createServerActionHttpDispatcher(runtime, [ping]);
    await expect(
      dispatcher.dispatch({
        name: "ping",
        input: { value: "y" },
      }),
    ).resolves.toEqual({
      _tag: "success",
      value: { pong: "y" },
    });

    await runtime.dispose();
  });

  it("supports effect-native action HTTP handlers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const actionHandlerEffect = createServerActionHttpHandlerEffect({
      runtime,
      actions: [ping],
      basePath: "/actions",
    });
    const success = await Effect.runPromise(
      actionHandlerEffect(
        new Request("https://example.test/actions/ping", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: { value: "ok" } }),
        }),
      ),
    );
    await expect(success.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "ok" },
    });

    const methodNotAllowed = await Effect.runPromise(
      actionHandlerEffect(new Request("https://example.test/actions/ping", { method: "GET" })),
    );
    expect(methodNotAllowed.status).toBe(405);

    const scopedHandlerEffect = createRequestScopedServerActionHttpHandlerEffect({
      runtime,
      actions: [ping],
      basePath: "/actions",
    });
    const unknown = await Effect.runPromise(
      scopedHandlerEffect(
        new Request("https://example.test/actions/unknown", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: {} }),
        }),
      ),
    );
    await expect(unknown.json()).resolves.toEqual({
      _tag: "defect",
      message: "Unknown server action: unknown",
    });

    await runtime.dispose();
  });

  it("converts unexpected defects to 500 responses in effect handlers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const badResponseRoute = defineRoute({
      id: "bad-response",
      path: "/bad-response",
    });

    const circular: { self?: unknown } = {};
    circular.self = circular;

    const routeHandler = defineRouteHandler({
      method: "GET",
      route: badResponseRoute,
      run: () => Effect.succeed(circular),
    });

    const routeEffectHandler = createRouteRequestHandlerEffect(runtime, [routeHandler]);
    const routeResponse = await Effect.runPromise(
      routeEffectHandler(new Request("https://example.test/bad-response", { method: "GET" })),
    );
    expect(routeResponse.status).toBe(500);

    const badAction = defineServerAction({
      name: "bad-action",
      run: () => Effect.succeed(circular),
    });

    const actionEffectHandler = createServerActionHttpHandlerEffect({
      runtime,
      actions: [badAction],
      basePath: "/actions",
    });

    const actionResponse = await Effect.runPromise(
      actionEffectHandler(
        new Request("https://example.test/actions/bad-action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: {} }),
        }),
      ),
    );
    expect(actionResponse.status).toBe(500);

    await runtime.dispose();
  });

  it("covers transport trailing slash, signal forwarding, and invalid payload branches", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response(JSON.stringify(123), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const transport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions/",
      fetcher,
    });

    await expect(
      transport.call("save", { id: "a" }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ServerActionTransportError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.test/actions/save");

    const invalidTagTransport = createFetchServerActionTransport({
      endpoint: "https://example.test/actions",
      fetcher: async () =>
        new Response(JSON.stringify({ _tag: "unknown" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(invalidTagTransport.call("save", {})).rejects.toBeInstanceOf(
      ServerActionTransportError,
    );
  });

  it("covers useServerAction callback branches for success and failure", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const okAction = defineServerAction({
      name: "ok",
      run: (input: { readonly name: string }) => Effect.succeed(`Hello ${input.name}`),
    });
    const failAction = defineServerAction({
      name: "fail",
      run: (_input: { readonly name: string }) => Effect.fail("boom"),
    });

    const dispatcher = createServerActionDispatcher(runtime, [okAction, failAction]);
    const transport = createInMemoryServerActionTransport(dispatcher);

    const successCalls = {
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onSettled: vi.fn(),
    };
    const failureCalls = {
      onError: vi.fn(),
      onSettled: vi.fn(),
    };

    const Probe = () => {
      const okMutation = useServerAction({
        action: okAction,
        transport,
        invalidate: [["users"]],
        onSuccess: successCalls.onSuccess,
        onError: successCalls.onError,
        onSettled: successCalls.onSettled,
      });
      const failMutation = useServerAction({
        action: failAction,
        transport,
        onError: failureCalls.onError,
        onSettled: failureCalls.onSettled,
      });

      return (
        <div>
          <button onClick={() => void okMutation.mutate({ name: "Rika" })}>run-ok</button>
          <button onClick={() => void failMutation.mutate({ name: "Rika" })}>run-fail</button>
          <div data-testid="ok-status">{okMutation.status}</div>
          <div data-testid="fail-status">{failMutation.status}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    screen.getByRole("button", { name: "run-ok" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("ok-status").textContent).toBe("success");
    });

    expect(successCalls.onSuccess).toHaveBeenCalledWith("Hello Rika", { name: "Rika" });
    expect(successCalls.onError).not.toHaveBeenCalled();
    expect(successCalls.onSettled).toHaveBeenCalled();

    screen.getByRole("button", { name: "run-fail" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("fail-status").textContent).toBe("failure");
    });

    expect(failureCalls.onError).toHaveBeenCalled();
    expect(failureCalls.onSettled).toHaveBeenCalled();

    await runtime.dispose();
  });

  it("classifies dispatcher defects and forwards signal through in-memory transport", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const signal = new AbortController().signal;

    const defectAction = defineServerAction({
      name: "defect",
      run: (_input: { readonly value: string }) => Effect.die("boom"),
    });

    const dispatcher = createServerActionDispatcher(runtime, [defectAction]);
    const directResult = await dispatcher.dispatch({
      name: "defect",
      input: { value: "x" },
      signal,
    });
    expect(directResult._tag).toBe("defect");

    const transport = createInMemoryServerActionTransport(dispatcher);
    const transportResult = await transport.call(
      "defect",
      { value: "x" },
      {
        signal,
      },
    );
    expect(transportResult._tag).toBe("defect");

    await runtime.dispose();
  });

  it("routes action and non-action requests through defineApp and builds transport endpoints", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const history = createMemoryRouterHistory("/hello");

    const helloRoute = defineRoute({
      id: "hello",
      path: "/hello",
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });
    const helloHandler = defineRouteHandler({
      method: "GET",
      route: helloRoute,
      run: () => Effect.succeed({ ok: true as const }),
    });

    const app = defineApp({
      runtime,
      routes: [helloRoute] as const,
      actions: [ping] as const,
      handlers: [helloHandler],
      middlewares: [
        (_context, next) =>
          next().pipe(Effect.map((value) => ({ ...value, middleware: true as const }))),
      ],
      history,
      actionBasePath: "actions/",
    });

    const server = app.createServerHandler();

    const baseResponse = await server(
      new Request("https://example.test/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "x" } }),
      }),
    );
    expect(baseResponse.status).toBe(404);

    const actionResponse = await server(
      new Request("https://example.test/actions/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "x" } }),
      }),
    );
    await expect(actionResponse.json()).resolves.toEqual({
      _tag: "success",
      value: { pong: "x" },
    });

    const routeResponse = await server(
      new Request("https://example.test/hello", { method: "GET" }),
    );
    await expect(routeResponse.json()).resolves.toEqual({
      ok: true,
      middleware: true,
    });

    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ _tag: "success", value: { pong: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const defaultTransport = app.createActionTransport();
    await defaultTransport.call("ping", { value: "default" });

    const customTransport = app.createActionTransport({ endpoint: "/custom-actions" });
    await customTransport.call("ping", { value: "custom" });

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "/actions/ping", expect.any(Object));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, "/custom-actions/ping", expect.any(Object));

    vi.unstubAllGlobals();
    await runtime.dispose();
  });

  it("request-scoped handler returns validation error for invalid input", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const schema: InputSchema<{ readonly value: number }> = {
      validate: (input) => {
        const obj = input as { readonly value?: unknown };
        if (typeof obj.value !== "number") {
          return { _tag: "failure", field: "value", message: "must be a number" };
        }
        return { _tag: "success", value: { value: obj.value } };
      },
    };

    const action = defineServerAction({
      name: "validated",
      inputSchema: schema,
      run: (input: { readonly value: number }) => Effect.succeed({ doubled: input.value * 2 }),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [action],
      basePath: "/api",
    });

    const invalidResponse = await handler(
      new Request("https://example.test/api/validated", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: "not a number" } }),
      }),
    );
    const invalidResult = (await invalidResponse.json()) as {
      readonly _tag: string;
      readonly field: string;
      readonly message: string;
    };
    expect(invalidResult._tag).toBe("validation");
    expect(invalidResult.field).toBe("value");

    const validResponse = await handler(
      new Request("https://example.test/api/validated", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { value: 5 } }),
      }),
    );
    const validResult = (await validResponse.json()) as {
      readonly _tag: string;
      readonly value: { readonly doubled: number };
    };
    expect(validResult._tag).toBe("success");
    expect(validResult.value.doubled).toBe(10);

    await runtime.dispose();
  });

  it("request-scoped handler encodes errors with errorCodec", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const codec: ErrorTransportCodec<{ readonly code: string }> = {
      encode: (error) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof (error as { readonly code?: unknown }).code === "string"
        ) {
          return { wire: true, code: (error as { readonly code: string }).code };
        }
        return { wire: true, code: "UNKNOWN" };
      },
      decode: (wire) => wire as { readonly code: string },
    };

    const failAction = defineServerAction({
      name: "fail-coded",
      errorCodec: codec,
      run: (_input: Record<string, never>) => Effect.fail({ code: "BOOM" }),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [failAction],
      basePath: "/api",
    });

    const response = await handler(
      new Request("https://example.test/api/fail-coded", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
    );
    const result = (await response.json()) as {
      readonly _tag: string;
      readonly error: { readonly wire: boolean; readonly code: string };
    };
    expect(result._tag).toBe("failure");
    expect(result.error).toEqual({ wire: true, code: "BOOM" });

    await runtime.dispose();
  });

  it("request-scoped handler handles unknown actions and bad JSON", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const dummy = defineServerAction({
      name: "dummy",
      run: (_input: Record<string, never>) => Effect.succeed("ok"),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [dummy],
      basePath: "/api",
    });

    const methodResponse = await handler(
      new Request("https://example.test/api/dummy", { method: "GET" }),
    );
    expect(methodResponse.status).toBe(405);

    const notFoundResponse = await handler(
      new Request("https://example.test/other/dummy", { method: "POST" }),
    );
    expect(notFoundResponse.status).toBe(404);

    const unknownResponse = await handler(
      new Request("https://example.test/api/unknown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
    );
    const unknownResult = (await unknownResponse.json()) as {
      readonly _tag: string;
      readonly message: string;
    };
    expect(unknownResult._tag).toBe("defect");
    expect(unknownResult.message).toContain("Unknown server action");

    const badJsonResponse = await handler(
      new Request("https://example.test/api/dummy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad",
      }),
    );
    expect(badJsonResponse.status).toBe(400);

    const badPayloadResponse = await handler(
      new Request("https://example.test/api/dummy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(123),
      }),
    );
    expect(badPayloadResponse.status).toBe(400);

    await runtime.dispose();
  });

  it("request-scoped handler handles defects (Effect.die)", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const dieAction = defineServerAction({
      name: "die",
      run: (_input: Record<string, never>) => Effect.die("unexpected crash"),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [dieAction],
      basePath: "/api",
    });

    const response = await handler(
      new Request("https://example.test/api/die", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
    );
    const result = (await response.json()) as {
      readonly _tag: string;
      readonly message: string;
    };
    expect(result._tag).toBe("defect");
    expect(result.message).toContain("unexpected crash");

    await runtime.dispose();
  });

  it("request-scoped handler injects RequestContext for cookie access", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const cookieAction = defineServerAction({
      name: "get-cookie",
      run: (_input: Record<string, never>) =>
        Effect.gen(function* () {
          const ctx = yield* RequestContext;
          return { token: ctx.cookies["token"] ?? "missing" };
        }),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [cookieAction],
      basePath: "/api",
    });

    const response = await handler(
      new Request("https://example.test/api/get-cookie", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "token=secret42",
        },
        body: JSON.stringify({ input: {} }),
      }),
    );
    const result = (await response.json()) as {
      readonly _tag: string;
      readonly value: { readonly token: string };
    };
    expect(result._tag).toBe("success");
    expect(result.value.token).toBe("secret42");

    await runtime.dispose();
  });
});
