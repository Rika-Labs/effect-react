import { Schema } from "effect";
import { Timestamp } from "./common.js";
import { UserId } from "./User.js";

export const TweetId = Schema.String.pipe(Schema.brand("TweetId"));
export type TweetId = typeof TweetId.Type;

export const Tweet = Schema.Struct({
  id: TweetId,
  content: Schema.String,
  authorId: UserId,
  authorHandle: Schema.String,
  authorDisplayName: Schema.String,
  authorAvatarUrl: Schema.NullOr(Schema.String),
  replyToId: Schema.NullOr(TweetId),
  likesCount: Schema.Number,
  retweetsCount: Schema.Number,
  repliesCount: Schema.Number,
  isLiked: Schema.Boolean,
  isRetweeted: Schema.Boolean,
  createdAt: Timestamp,
});
export type Tweet = typeof Tweet.Type;

export const CreateTweet = Schema.Struct({
  content: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(280)),
  replyToId: Schema.optionalWith(TweetId, { as: "Option" }),
});
export type CreateTweet = typeof CreateTweet.Type;

export const FeedCursor = Schema.Struct({
  cursor: Schema.optionalWith(Schema.String, { as: "Option" }),
  limit: Schema.optionalWith(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 50)), {
    default: () => 20,
  }),
});
export type FeedCursor = typeof FeedCursor.Type;

export const FeedPage = Schema.Struct({
  items: Schema.Array(Tweet),
  nextCursor: Schema.NullOr(Schema.String),
});
export type FeedPage = typeof FeedPage.Type;

export const TweetIdParam = Schema.Struct({
  id: TweetId,
});
export type TweetIdParam = typeof TweetIdParam.Type;
