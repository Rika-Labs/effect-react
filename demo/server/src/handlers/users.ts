import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CurrentUser, TwitterApi } from "@twitter-demo/shared";
import { UserService } from "../services/UserService.js";
import { AuthService } from "../services/AuthService.js";
import { AuthMiddlewareLive } from "../middleware/auth.js";

export const UsersHandlers = HttpApiBuilder.group(TwitterApi, "users", (handlers) =>
  handlers
    .handle("me", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* AuthService;
        return yield* svc.getMe(user.id);
      }),
    )
    .handle("getProfile", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* UserService;
        return yield* svc.getProfile(user.id, path.handle);
      }),
    )
    .handle("follow", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* UserService;
        return yield* svc.follow(user.id, path.handle);
      }),
    )
    .handle("unfollow", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* UserService;
        return yield* svc.unfollow(user.id, path.handle);
      }),
    )
    .handle("followers", ({ path }) =>
      Effect.gen(function* () {
        const svc = yield* UserService;
        return yield* svc.followers(path.handle);
      }),
    )
    .handle("following", ({ path }) =>
      Effect.gen(function* () {
        const svc = yield* UserService;
        return yield* svc.following(path.handle);
      }),
    )
    .handle("suggestions", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* UserService;
        return yield* svc.suggestions(user.id);
      }),
    )
    .handle("likedTweets", ({ path, urlParams }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const svc = yield* UserService;
        return yield* svc.likedTweets(user.id, path.handle, urlParams);
      }),
    ),
).pipe(Layer.provide(AuthMiddlewareLive));
