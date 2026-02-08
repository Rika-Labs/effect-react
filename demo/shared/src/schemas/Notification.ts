import { Schema } from "effect";
import { Timestamp } from "./common.js";
import { UserId } from "./User.js";
import { TweetId } from "./Tweet.js";

export const NotificationType = Schema.Literal("like", "retweet", "follow");
export type NotificationType = typeof NotificationType.Type;

export const Notification = Schema.Struct({
  id: Schema.String,
  type: NotificationType,
  actorId: UserId,
  actorHandle: Schema.String,
  actorDisplayName: Schema.String,
  tweetId: Schema.NullOr(TweetId),
  read: Schema.Boolean,
  createdAt: Timestamp,
});
export type Notification = typeof Notification.Type;

export const NotificationList = Schema.Struct({
  items: Schema.Array(Notification),
  nextCursor: Schema.NullOr(Schema.String),
  unreadCount: Schema.Number,
});
export type NotificationList = typeof NotificationList.Type;

export const MarkReadRequest = Schema.Struct({
  ids: Schema.Array(Schema.String),
});
export type MarkReadRequest = typeof MarkReadRequest.Type;
