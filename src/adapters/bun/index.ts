import { Effect } from "effect";
import {
  toRequestHandler,
  type AdapterServer,
  type AdapterServeOptions,
  type HandlerSource,
} from "../core/types";

interface BunServerLike {
  readonly stop: (closeActiveConnections?: boolean) => void;
  readonly port?: number;
}

interface BunLike {
  readonly serve: (options: {
    readonly port?: number;
    readonly hostname?: string;
    readonly fetch: (request: Request) => Response | Promise<Response>;
    readonly error?: (error: unknown) => Response | Promise<Response>;
  }) => BunServerLike;
}

const getBun = (): BunLike | undefined => (globalThis as { readonly Bun?: BunLike }).Bun;

export class BunAdapterUnavailableError extends Error {
  constructor() {
    super("Bun global was not found. Run this adapter in Bun runtime.");
    this.name = "BunAdapterUnavailableError";
  }
}

export const serveWithBun = (
  source: HandlerSource,
  options: AdapterServeOptions = {},
): Effect.Effect<AdapterServer, BunAdapterUnavailableError, never> =>
  Effect.gen(function* () {
    const bun = getBun();
    if (bun === undefined) {
      return yield* Effect.fail(new BunAdapterUnavailableError());
    }

    const handler = toRequestHandler(source);
    const onError = options.onError;
    const server = bun.serve({
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.hostname !== undefined ? { hostname: options.hostname } : {}),
      fetch: (request) => Effect.runPromise(handler(request)),
      ...(onError !== undefined
        ? { error: (error: unknown) => Effect.runPromise(onError(error)) }
        : {}),
    });

    return {
      ...(server.port !== undefined ? { port: server.port } : {}),
      close: Effect.sync(() => {
        server.stop(true);
      }),
    } satisfies AdapterServer;
  });
