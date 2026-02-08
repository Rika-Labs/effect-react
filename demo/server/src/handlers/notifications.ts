import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CurrentUser, TwitterApi } from "@twitter-demo/shared";
import { NotificationService } from "../services/NotificationService.js";
import { AuthMiddlewareLive } from "../middleware/auth.js";

export const NotificationsHandlers = HttpApiBuilder.group(
  TwitterApi,
  "notifications",
  (handlers) =>
    handlers
      .handle("list", ({ urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* NotificationService;
          return yield* svc.list(user.id, urlParams);
        }),
      )
      .handle("markRead", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const svc = yield* NotificationService;
          return yield* svc.markRead(user.id, payload.ids);
        }),
      ),
).pipe(Layer.provide(AuthMiddlewareLive));
