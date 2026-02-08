import { Effect, Layer, Redacted } from "effect";
import * as jose from "jose";
import { AuthMiddleware, Unauthorized } from "@twitter-demo/shared";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);

export const AuthMiddlewareLive = Layer.succeed(
  AuthMiddleware,
  AuthMiddleware.of({
    bearer: (token: Redacted.Redacted) =>
      Effect.gen(function* () {
        const raw = Redacted.value(token);
        const result = yield* Effect.tryPromise({
          try: () => jose.jwtVerify(raw, JWT_SECRET),
          catch: () => new Unauthorized({ message: "Invalid or expired token" }),
        });
        return {
          id: result.payload.sub as string,
          handle: result.payload.handle as string,
        };
      }),
  }),
);
