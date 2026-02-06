import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Cause, Effect } from "effect";
import {
  toRequestHandler,
  type AdapterServer,
  type AdapterServeOptions,
  type HandlerSource,
} from "../core/types";

const toHeaders = (request: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }
  return headers;
};

const headerValue = (value: string | string[] | undefined, fallback: string): string => {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
};

const toRequest = (request: IncomingMessage): Request => {
  const protocol = headerValue(request.headers["x-forwarded-proto"], "http");
  const host = headerValue(request.headers.host, "localhost");
  const url = `${protocol}://${host}${request.url ?? "/"}`;
  const method = request.method ?? "GET";
  const isBodyless = method === "GET" || method === "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: toHeaders(request),
  };

  if (!isBodyless) {
    init.body = Readable.toWeb(request) as BodyInit;
    init.duplex = "half";
  }

  return new Request(url, init);
};

const writeResponse = (
  response: Response,
  target: ServerResponse,
): Effect.Effect<void, unknown, never> =>
  Effect.gen(function* () {
    target.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      target.setHeader(key, value);
    }

    const bodyBuffer =
      response.body === null
        ? null
        : yield* Effect.tryPromise({
            try: () => response.arrayBuffer(),
            catch: (error) => error,
          });

    yield* Effect.async<void, unknown>((resume) => {
      const onError = (error: unknown) => {
        resume(Effect.fail(error));
      };
      target.once("error", onError);
      if (bodyBuffer === null) {
        target.end(() => {
          target.off("error", onError);
          resume(Effect.void);
        });
      } else {
        target.end(Buffer.from(bodyBuffer), () => {
          target.off("error", onError);
          resume(Effect.void);
        });
      }

      return Effect.sync(() => {
        target.off("error", onError);
      });
    });
  });

const writeInternalError = (target: ServerResponse): void => {
  target.statusCode = 500;
  target.setHeader("content-type", "text/plain; charset=utf-8");
  target.end("Internal Server Error");
};

export const serveWithNode = (
  source: HandlerSource,
  options: AdapterServeOptions = {},
): Effect.Effect<AdapterServer, unknown, never> =>
  Effect.gen(function* () {
    const handler = toRequestHandler(source);
    const onError = options.onError;

    const server = createServer((incoming, outgoing) => {
      const program = Effect.gen(function* () {
        const request = toRequest(incoming);
        const response = yield* handler(request);
        yield* writeResponse(response, outgoing);
      }).pipe(
        Effect.catchAllCause((cause) => {
          if (onError === undefined) {
            return Effect.sync(() => {
              writeInternalError(outgoing);
            });
          }

          const squashed = Cause.squash(cause);
          return onError(squashed).pipe(
            Effect.flatMap((response) => writeResponse(response, outgoing)),
            Effect.catchAll(() =>
              Effect.sync(() => {
                writeInternalError(outgoing);
              }),
            ),
          );
        }),
      );

      void Effect.runPromise(program);
    });

    yield* Effect.async<void, unknown>((resume) => {
      const listenError = (error: unknown) => {
        resume(Effect.fail(error));
      };

      server.once("error", listenError);
      server.listen(options.port ?? 3000, options.hostname, () => {
        server.off("error", listenError);
        resume(Effect.void);
      });

      return Effect.sync(() => {
        server.off("error", listenError);
      });
    });

    const port = (() => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        return undefined;
      }
      return (address as AddressInfo).port;
    })();

    return {
      ...(port !== undefined ? { port } : {}),
      close: Effect.async<void, unknown>((resume) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            resume(Effect.fail(error));
            return;
          }
          resume(Effect.void);
        });
      }),
    } satisfies AdapterServer;
  });
