import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CurrentUser, TwitterApi } from "@twitter-demo/shared";
import { InteractionService } from "../services/InteractionService.js";
import { AuthMiddlewareLive } from "../middleware/auth.js";

export const InteractionsHandlers = HttpApiBuilder.group(
  TwitterApi,
  "interactions",
  (handlers) =>
    handlers
      .handle("like", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* InteractionService;
          return yield* svc.like(user.id, path.id);
        }),
      )
      .handle("unlike", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* InteractionService;
          return yield* svc.unlike(user.id, path.id);
        }),
      )
      .handle("retweet", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* InteractionService;
          return yield* svc.retweet(user.id, path.id);
        }),
      )
      .handle("unretweet", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* InteractionService;
          return yield* svc.unretweet(user.id, path.id);
        }),
      ),
).pipe(Layer.provide(AuthMiddlewareLive));
