import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { TweetId } from "../schemas/Tweet.js";
import { NotFound } from "../schemas/Errors.js";
import { AuthMiddleware } from "./middleware.js";

export class InteractionsApi extends HttpApiGroup.make("interactions")
  .add(
    HttpApiEndpoint.post("like", "/tweets/:id/like")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Schema.Void),
  )
  .add(
    HttpApiEndpoint.del("unlike", "/tweets/:id/like")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Schema.Void),
  )
  .add(
    HttpApiEndpoint.post("retweet", "/tweets/:id/retweet")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Schema.Void),
  )
  .add(
    HttpApiEndpoint.del("unretweet", "/tweets/:id/retweet")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Schema.Void),
  )
  .addError(NotFound)
  .middleware(AuthMiddleware) {}
