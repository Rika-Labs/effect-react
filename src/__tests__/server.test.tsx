import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { render, screen, waitFor } from "@testing-library/react";
import { EffectProvider } from "../provider";
import { defineRoute } from "../router";
import {
  callServerActionByName,
  callServerAction,
  createInMemoryServerActionTransport,
  createRequestScopedServerActionHttpHandler,
  createRouteRequestHandler,
  createServerActionDispatcher,
  defineRouteHandler,
  defineServerAction,
  RequestContext,
  RequestContextLive,
  useServerAction,
  validationError,
  unauthorizedError,
  forbiddenError,
  identityErrorCodec,
} from "../server";
import type { InputSchema, ErrorTransportCodec } from "../server";

describe("server", () => {
  it("dispatches server actions with typed input and output", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const increment = defineServerAction({
      name: "counter.increment",
      run: (input: { readonly value: number }) => Effect.succeed({ next: input.value + 1 }),
    });

    const dispatcher = createServerActionDispatcher(runtime, [increment]);
    const transport = createInMemoryServerActionTransport(dispatcher);

    const value = await Effect.runPromise(callServerAction(transport, increment, { value: 2 }));
    expect(value.next).toBe(3);

    await runtime.dispose();
  });

  it("dispatches server actions by explicit action name", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const increment = defineServerAction({
      name: "counter.increment",
      run: (input: { readonly value: number }) => Effect.succeed({ next: input.value + 1 }),
    });

    const dispatcher = createServerActionDispatcher(runtime, [increment]);
    const transport = createInMemoryServerActionTransport(dispatcher);

    const value = await Effect.runPromise(
      callServerActionByName<{ readonly next: number }, never>(transport, "counter.increment", {
        value: 3,
      }),
    );
    expect(value.next).toBe(4);

    await runtime.dispose();
  });

  it("handles typed route handlers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const userRoute = defineRoute({
      id: "api.user",
      path: "/api/users/:id",
    });

    const handler = defineRouteHandler({
      method: "GET",
      route: userRoute,
      run: ({ params }) => Effect.succeed({ id: params.id, ok: true as const }),
    });

    const requestHandler = createRouteRequestHandler(runtime, [handler]);
    const response = await requestHandler(
      new Request("https://example.test/api/users/alice", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "alice", ok: true });

    await runtime.dispose();
  });

  it("applies route middlewares as Effect programs", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const route = defineRoute({
      id: "api.middleware",
      path: "/api/middleware",
    });

    const handler = defineRouteHandler({
      method: "GET",
      route,
      run: () => Effect.succeed({ ok: true as const }),
    });

    const requestHandler = createRouteRequestHandler(runtime, [handler], {
      middlewares: [
        (_context, next) =>
          next().pipe(
            Effect.map((result) => ({
              ...result,
              middleware: true as const,
            })),
          ),
      ],
    });

    const response = await requestHandler(
      new Request("https://example.test/api/middleware", { method: "GET" }),
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      middleware: true,
    });

    await runtime.dispose();
  });

  it("integrates with useServerAction and EffectProvider", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const greet = defineServerAction({
      name: "greet",
      run: (input: { readonly name: string }) => Effect.succeed(`Hello ${input.name}`),
    });

    const dispatcher = createServerActionDispatcher(runtime, [greet]);
    const transport = createInMemoryServerActionTransport(dispatcher);

    const Probe = () => {
      const mutation = useServerAction({
        action: greet,
        transport,
      });

      return (
        <div>
          <button onClick={() => void mutation.mutate({ name: "Rika" })}>run</button>
          <div data-testid="status">{mutation.status}</div>
          <div data-testid="value">{mutation.data ?? "-"}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    screen.getByRole("button", { name: "run" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("success");
    });
    expect(screen.getByTestId("value").textContent).toBe("Hello Rika");

    await runtime.dispose();
  });

  it("injects RequestContext into server actions via request-scoped handler", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const whoami = defineServerAction({
      name: "whoami",
      run: (_input: Record<string, never>) =>
        Effect.gen(function* () {
          const ctx = yield* RequestContext;
          return {
            method: ctx.method,
            url: ctx.url.pathname,
            cookie: ctx.cookies["session"] ?? "none",
          };
        }),
    });

    const handler = createRequestScopedServerActionHttpHandler({
      runtime,
      actions: [whoami],
      basePath: "/api/actions",
    });

    const response = await handler(
      new Request("https://example.test/api/actions/whoami", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "session=abc123; theme=dark",
        },
        body: JSON.stringify({ input: {} }),
      }),
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      readonly _tag: string;
      readonly value: { readonly method: string; readonly url: string; readonly cookie: string };
    };
    expect(result._tag).toBe("success");
    expect(result.value.method).toBe("POST");
    expect(result.value.url).toBe("/api/actions/whoami");
    expect(result.value.cookie).toBe("abc123");

    await runtime.dispose();
  });

  it("validates input with inputSchema before running action", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const schema: InputSchema<{ readonly name: string }> = {
      validate: (input) => {
        const obj = input as { readonly name?: unknown };
        if (typeof obj.name !== "string" || obj.name.length === 0) {
          return { _tag: "failure", field: "name", message: "name is required" };
        }
        return { _tag: "success", value: { name: obj.name } };
      },
    };

    const greet = defineServerAction({
      name: "greet",
      inputSchema: schema,
      run: (input: { readonly name: string }) => Effect.succeed(`Hello ${input.name}`),
    });

    const dispatcher = createServerActionDispatcher(runtime, [greet]);

    const failResult = await dispatcher.dispatch({
      name: "greet",
      input: { name: "" },
    });
    expect(failResult._tag).toBe("validation");
    if (failResult._tag === "validation") {
      expect(failResult.field).toBe("name");
      expect(failResult.message).toBe("name is required");
    }

    const successResult = await dispatcher.dispatch({
      name: "greet",
      input: { name: "Rika" },
    });
    expect(successResult._tag).toBe("success");

    await runtime.dispose();
  });

  it("encodes errors with errorCodec when provided", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    interface AppError {
      readonly code: string;
      readonly detail: string;
    }

    const errorCodec: ErrorTransportCodec<AppError> = {
      encode: (error) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof (error as { readonly code?: unknown }).code === "string"
        ) {
          return { encoded: true, code: (error as { readonly code: string }).code };
        }
        return { encoded: true, code: "UNKNOWN" };
      },
      decode: (wire) => wire as AppError,
    };

    const failAction = defineServerAction({
      name: "fail",
      errorCodec,
      run: (_input: Record<string, never>) =>
        Effect.fail({ code: "NOT_FOUND", detail: "missing" } as AppError),
    });

    const dispatcher = createServerActionDispatcher(runtime, [failAction]);
    const result = await dispatcher.dispatch({
      name: "fail",
      input: {},
    });

    expect(result._tag).toBe("failure");
    if (result._tag === "failure") {
      expect(result.error).toEqual({ encoded: true, code: "NOT_FOUND" });
    }

    await runtime.dispose();
  });

  it("creates error boundary types with factory functions", () => {
    const v = validationError("email", "invalid email");
    expect(v._tag).toBe("ValidationError");
    expect(v.field).toBe("email");

    const u = unauthorizedError("not logged in");
    expect(u._tag).toBe("UnauthorizedError");
    expect(u.message).toBe("not logged in");

    const f = forbiddenError("admin only");
    expect(f._tag).toBe("ForbiddenError");
    expect(f.message).toBe("admin only");
  });

  it("identity error codec passes through unchanged", () => {
    const error = { code: "test" };
    expect(identityErrorCodec.encode(error)).toBe(error);
    expect(identityErrorCodec.decode(error)).toBe(error);
  });

  it("callServerAction handles validation wire result", async () => {
    const action = defineServerAction({
      name: "val",
      run: (_input: Record<string, never>) => Effect.succeed("ok"),
    });

    const transport = {
      call: async () => ({
        _tag: "validation" as const,
        field: "email",
        message: "required",
      }),
    };

    const result = await Effect.runPromiseExit(callServerAction(transport, action, {}));
    expect(result._tag).toBe("Failure");
  });

  it("RequestContextLive parses cookies correctly", async () => {
    const request = new Request("https://example.test/path?q=1", {
      method: "GET",
      headers: {
        cookie: "a=1; b=2; c=",
      },
    });

    const layer = RequestContextLive(request);
    const program = Effect.gen(function* () {
      const ctx = yield* RequestContext;
      return ctx;
    });
    const provided = Effect.provide(program, layer);

    const ctx = await Effect.runPromise(provided);
    expect(ctx.method).toBe("GET");
    expect(ctx.url.pathname).toBe("/path");
    expect(ctx.url.searchParams.get("q")).toBe("1");
    expect(ctx.cookies).toEqual({ a: "1", b: "2", c: "" });
    expect(ctx.headers.get("cookie")).toBe("a=1; b=2; c=");
  });

  it("RequestContextLive handles empty cookie header", async () => {
    const request = new Request("https://example.test/path", {
      method: "POST",
    });

    const layer = RequestContextLive(request);
    const program = Effect.provide(
      Effect.gen(function* () {
        const ctx = yield* RequestContext;
        return ctx;
      }),
      layer,
    );

    const ctx = await Effect.runPromise(program);
    expect(ctx.cookies).toEqual({});
    expect(ctx.method).toBe("POST");
  });

  it("injects RequestContext into route handlers", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const route = defineRoute({
      id: "api.ctx",
      path: "/api/ctx",
    });

    const handler = defineRouteHandler({
      method: "GET",
      route,
      run: () =>
        Effect.gen(function* () {
          const ctx = yield* RequestContext;
          return { method: ctx.method, path: ctx.url.pathname };
        }),
    });

    const requestHandler = createRouteRequestHandler(runtime, [handler]);
    const response = await requestHandler(
      new Request("https://example.test/api/ctx", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: "GET",
      path: "/api/ctx",
    });

    await runtime.dispose();
  });
});
