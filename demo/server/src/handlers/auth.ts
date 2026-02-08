import { HttpApiBuilder } from "@effect/platform";
import { Effect } from "effect";
import { TwitterApi } from "@twitter-demo/shared";
import { AuthService } from "../services/AuthService.js";

export const AuthHandlers = HttpApiBuilder.group(TwitterApi, "auth", (handlers) =>
  handlers
    .handle("register", ({ payload }) =>
      Effect.flatMap(AuthService, (svc) => svc.register(payload)),
    )
    .handle("login", ({ payload }) =>
      Effect.flatMap(AuthService, (svc) => svc.login(payload)),
    ),
);
