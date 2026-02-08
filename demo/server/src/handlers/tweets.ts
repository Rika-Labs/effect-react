import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CurrentUser, TwitterApi } from "@twitter-demo/shared";
import { TweetService } from "../services/TweetService.js";
import { AuthMiddlewareLive } from "../middleware/auth.js";

export const TweetsHandlers = HttpApiBuilder.group(TwitterApi, "tweets", (handlers) =>
  handlers
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* TweetService;
        return yield* svc.create(user.id, payload);
      }),
    )
    .handle("feed", ({ urlParams }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* TweetService;
        return yield* svc.feed(user.id, urlParams);
      }),
    )
    .handle("getById", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* TweetService;
        return yield* svc.getById(user.id, path.id);
      }),
    )
    .handle("getReplies", ({ path, urlParams }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* TweetService;
        return yield* svc.getReplies(user.id, path.id, urlParams);
      }),
    )
    .handle("remove", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* TweetService;
        return yield* svc.remove(user.id, path.id);
      }),
    ),
).pipe(Layer.provide(AuthMiddlewareLive));
