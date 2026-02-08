import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CurrentUser, TwitterApi } from "@twitter-demo/shared";
import { SearchService } from "../services/SearchService.js";
import { AuthMiddlewareLive } from "../middleware/auth.js";

export const SearchHandlers = HttpApiBuilder.group(TwitterApi, "search", (handlers) =>
  handlers.handle("search", ({ urlParams }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      const svc = yield* SearchService;
      return yield* svc.search(user.id, urlParams);
    }),
  ),
).pipe(Layer.provide(AuthMiddlewareLive));
