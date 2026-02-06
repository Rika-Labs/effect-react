import { Effect } from "effect";

export interface AdapterApplication {
  readonly createServerHandler: () => (request: Request) => Promise<Response>;
}

export type PromiseRequestHandler = (request: Request) => Promise<Response>;

export type RequestHandler = (request: Request) => Effect.Effect<Response, unknown, never>;

export type HandlerSource = AdapterApplication | PromiseRequestHandler;

export type AdapterErrorHandler = (error: unknown) => Effect.Effect<Response, unknown, never>;

export interface AdapterServeOptions {
  readonly port?: number;
  readonly hostname?: string;
  readonly onError?: AdapterErrorHandler;
}

export interface AdapterServer {
  readonly close: Effect.Effect<void, unknown, never>;
  readonly port?: number;
}

const hasCreateServerHandler = (source: HandlerSource): source is AdapterApplication =>
  typeof source === "object" && source !== null && "createServerHandler" in source;

export const toRequestHandler = (source: HandlerSource): RequestHandler => {
  if (hasCreateServerHandler(source)) {
    const handler = source.createServerHandler();
    return (request) =>
      Effect.tryPromise({
        try: () => handler(request),
        catch: (error) => error,
      });
  }

  return (request) =>
    Effect.tryPromise({
      try: () => source(request),
      catch: (error) => error,
    });
};
