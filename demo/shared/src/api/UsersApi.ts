import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { User, UserProfile } from "../schemas/User.js";
import { Paginated, PaginationCursor } from "../schemas/common.js";
import { FeedPage } from "../schemas/Tweet.js";
import { NotFound, Unauthorized } from "../schemas/Errors.js";
import { AuthMiddleware } from "./middleware.js";

export class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("me", "/auth/me")
      .addSuccess(User)
      .addError(Unauthorized),
  )
  .add(
    HttpApiEndpoint.get("suggestions", "/users/suggestions")
      .addSuccess(Schema.Array(User)),
  )
  .add(
    HttpApiEndpoint.get("getProfile", "/users/:handle")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .addSuccess(UserProfile),
  )
  .add(
    HttpApiEndpoint.post("follow", "/users/:handle/follow")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .addSuccess(Schema.Void),
  )
  .add(
    HttpApiEndpoint.del("unfollow", "/users/:handle/follow")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .addSuccess(Schema.Void),
  )
  .add(
    HttpApiEndpoint.get("followers", "/users/:handle/followers")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .addSuccess(Paginated(User)),
  )
  .add(
    HttpApiEndpoint.get("following", "/users/:handle/following")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .addSuccess(Paginated(User)),
  )
  .add(
    HttpApiEndpoint.get("likedTweets", "/users/:handle/likes")
      .setPath(Schema.Struct({ handle: Schema.String }))
      .setUrlParams(PaginationCursor)
      .addSuccess(FeedPage),
  )
  .addError(NotFound)
  .addError(Unauthorized)
  .middleware(AuthMiddleware) {}
