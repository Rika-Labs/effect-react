import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { serveWithBun } from "../adapters";

describe("bun adapter integration", () => {
  it("uses Bun.serve handler wiring and closes with stop(true)", async () => {
    const holder = globalThis as {
      Bun?: {
        serve: (options: {
          port?: number;
          fetch: (request: Request) => Response | Promise<Response>;
          error?: (error: unknown) => Response | Promise<Response>;
        }) => {
          port?: number;
          stop: (closeActiveConnections?: boolean) => void;
        };
      };
    };

    const previous = holder.Bun;
    let stopArg: boolean | undefined;
    let capturedFetch: ((request: Request) => Response | Promise<Response>) | undefined;
    let capturedError: ((error: unknown) => Response | Promise<Response>) | undefined;

    holder.Bun = {
      serve: (options) => {
        capturedFetch = options.fetch;
        capturedError = options.error;
        return {
          port: options.port ?? 4000,
          stop: (closeActiveConnections?: boolean) => {
            stopArg = closeActiveConnections;
          },
        };
      },
    };

    try {
      const server = await Effect.runPromise(
        serveWithBun(
          async (request) =>
            new Response(`bun:${new URL(request.url).pathname}`, {
              status: 200,
            }),
          {
            port: 0,
            onError: () =>
              Effect.succeed(
                new Response("fallback", {
                  status: 500,
                }),
              ),
          },
        ),
      );

      expect(server.port).toBeTypeOf("number");

      if (capturedFetch === undefined || capturedError === undefined) {
        throw new Error("Expected Bun.serve handlers to be captured");
      }

      const okResponse = await capturedFetch(new Request("https://example.test/ok"));
      await expect(okResponse.text()).resolves.toBe("bun:/ok");

      const errorResponse = await capturedError(new Error("boom"));
      expect(errorResponse.status).toBe(500);

      await Effect.runPromise(server.close);
      expect(stopArg).toBe(true);
    } finally {
      if (previous === undefined) {
        delete holder.Bun;
      } else {
        holder.Bun = previous;
      }
    }
  });
});
