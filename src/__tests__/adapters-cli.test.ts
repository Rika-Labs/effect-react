import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { NodeContext } from "@effect/platform-node";
import {
  BunAdapterUnavailableError,
  serveWithBun,
  serveWithNode,
  toRequestHandler,
} from "../adapters";
import { runCli } from "../cli";

describe("adapters + cli", () => {
  it("converts promise request handlers to Effect handlers", async () => {
    const handler = toRequestHandler(
      async (request) =>
        new Response(`ok:${new URL(request.url).pathname}`, {
          status: 200,
        }),
    );

    const response = await Effect.runPromise(handler(new Request("https://example.test/ping")));
    await expect(response.text()).resolves.toBe("ok:/ping");
  });

  it("fails fast when Bun adapter is used outside Bun", async () => {
    const holder = globalThis as { Bun?: unknown };
    const previous = holder.Bun;
    delete holder.Bun;

    const exit = await Effect.runPromiseExit(
      serveWithBun(
        async () =>
          new Response("ok", {
            status: 200,
          }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(BunAdapterUnavailableError);
    }

    if (previous !== undefined) {
      holder.Bun = previous;
    }
  });

  it("returns usage failure for unknown CLI commands", async () => {
    const exit = await Effect.runPromiseExit(
      runCli(["node", "effect-react", "unknown-command"]).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("serves requests with node adapter and reports bound port", async () => {
    const server = await Effect.runPromise(
      serveWithNode(
        async (request) =>
          new Response(`node:${new URL(request.url).pathname}`, {
            status: 200,
          }),
        { port: 0 },
      ),
    );

    try {
      expect(server.port).toBeTypeOf("number");
      const response = await fetch(`http://127.0.0.1:${String(server.port)}/health`);
      await expect(response.text()).resolves.toBe("node:/health");
    } finally {
      await Effect.runPromise(server.close);
    }
  });

  it("uses node adapter onError fallback for thrown handler errors", async () => {
    const server = await Effect.runPromise(
      serveWithNode(
        async () => {
          throw new Error("boom");
        },
        {
          port: 0,
          onError: () =>
            Effect.succeed(
              new Response("fallback", {
                status: 418,
              }),
            ),
        },
      ),
    );

    try {
      const response = await fetch(`http://127.0.0.1:${String(server.port)}/broken`);
      expect(response.status).toBe(418);
      await expect(response.text()).resolves.toBe("fallback");
    } finally {
      await Effect.runPromise(server.close);
    }
  });
});
