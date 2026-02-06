import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { defineRoute } from "../router";
import {
  createRequestPipeline,
  defineRouteHandler,
  defineServerAction,
  type ContextMiddleware,
  type RouteMiddleware,
} from "../server";

describe("pipeline integration", () => {
  it("routes actions and route handlers through a single request pipeline", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const usersRoute = defineRoute({
      id: "users",
      path: "/users/:id",
    });

    const visited: string[] = [];

    const middleware: RouteMiddleware = (context, next) =>
      Effect.gen(function* () {
        visited.push(
          `${context.request.method}:${context.route.id}:${context.params["id"] ?? "-"}`,
        );
        return yield* next();
      });

    let contextLayerProvided = false;
    const contextMiddleware: ContextMiddleware = {
      provide: () => {
        contextLayerProvided = true;
        return Layer.empty;
      },
    };

    const routeHandler = defineRouteHandler({
      method: "GET",
      route: usersRoute,
      run: ({ params }) => Effect.succeed({ id: params.id }),
    });

    const createUser = defineServerAction({
      name: "users/create",
      run: (input: { readonly id: string }) => Effect.succeed({ created: input.id }),
    });

    const pipeline = createRequestPipeline({
      runtime,
      routes: [usersRoute] as const,
      actions: [createUser],
      handlers: [routeHandler],
      routeOptions: {
        middlewares: [middleware],
        contextMiddlewares: [contextMiddleware],
      },
      actionBasePath: "actions",
    });

    const actionResponse = await pipeline.handle(
      new Request("https://example.test/actions/users%2Fcreate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { id: "u1" } }),
      }),
    );
    expect(actionResponse.status).toBe(200);
    await expect(actionResponse.json()).resolves.toEqual({
      _tag: "success",
      value: { created: "u1" },
    });

    const routeResponse = await pipeline.handle(
      new Request("https://example.test/users/u1", {
        method: "GET",
      }),
    );
    expect(routeResponse.status).toBe(200);
    await expect(routeResponse.json()).resolves.toEqual({ id: "u1" });
    expect(visited).toEqual(["GET:users:u1"]);
    expect(contextLayerProvided).toBe(true);

    const actionRootResponse = await pipeline.handle(
      new Request("https://example.test/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
    );
    expect(actionRootResponse.status).toBe(404);

    const effectRouteResponse = await Effect.runPromise(
      pipeline.handleEffect(
        new Request("https://example.test/users/u2", {
          method: "GET",
        }),
      ),
    );
    expect(effectRouteResponse.status).toBe(200);
    await expect(effectRouteResponse.json()).resolves.toEqual({ id: "u2" });

    await runtime.dispose();
  });
});
