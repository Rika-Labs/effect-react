import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { CreateTweet, FeedCursor, FeedPage, Tweet, TweetId } from "../schemas/Tweet.js";
import { NotFound, Unauthorized } from "../schemas/Errors.js";
import { AuthMiddleware } from "./middleware.js";

export class TweetsApi extends HttpApiGroup.make("tweets")
  .add(
    HttpApiEndpoint.post("create", "/tweets").setPayload(CreateTweet).addSuccess(Tweet),
  )
  .add(
    HttpApiEndpoint.get("feed", "/feed").setUrlParams(FeedCursor).addSuccess(FeedPage),
  )
  .add(
    HttpApiEndpoint.get("getById", "/tweets/:id")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Tweet),
  )
  .add(
    HttpApiEndpoint.get("getReplies", "/tweets/:id/replies")
      .setPath(Schema.Struct({ id: TweetId }))
      .setUrlParams(FeedCursor)
      .addSuccess(FeedPage),
  )
  .add(
    HttpApiEndpoint.del("remove", "/tweets/:id")
      .setPath(Schema.Struct({ id: TweetId }))
      .addSuccess(Schema.Void),
  )
  .addError(NotFound)
  .addError(Unauthorized)
  .middleware(AuthMiddleware) {}
