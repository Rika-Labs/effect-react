import { HttpApiBuilder, HttpMiddleware } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Layer } from "effect";
import { TwitterApi } from "@twitter-demo/shared";
import { AuthHandlers } from "./handlers/auth.js";
import { TweetsHandlers } from "./handlers/tweets.js";
import { UsersHandlers } from "./handlers/users.js";
import { InteractionsHandlers } from "./handlers/interactions.js";
import { NotificationsHandlers } from "./handlers/notifications.js";
import { SearchHandlers } from "./handlers/search.js";
import { AuthServiceLive } from "./services/AuthService.js";
import { TweetServiceLive } from "./services/TweetService.js";
import { UserServiceLive } from "./services/UserService.js";
import { InteractionServiceLive } from "./services/InteractionService.js";
import { NotificationServiceLive } from "./services/NotificationService.js";
import { SearchServiceLive } from "./services/SearchService.js";
import { DbLive } from "./db/client.js";

const ServicesLive = Layer.mergeAll(
  AuthServiceLive,
  TweetServiceLive,
  UserServiceLive,
  InteractionServiceLive,
  NotificationServiceLive,
  SearchServiceLive,
).pipe(Layer.provide(DbLive));

const HandlersLive = Layer.mergeAll(
  AuthHandlers,
  TweetsHandlers,
  UsersHandlers,
  InteractionsHandlers,
  NotificationsHandlers,
  SearchHandlers,
).pipe(Layer.provide(ServicesLive));

const ApiLive = HttpApiBuilder.api(TwitterApi).pipe(
  Layer.provide(HandlersLive),
);

HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  Layer.provide(BunHttpServer.layer({ port: 4000 })),
  Layer.launch,
  BunRuntime.runMain,
);
