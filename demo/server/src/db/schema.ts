import { boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  handle: text("handle").unique().notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").default("").notNull(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash").notNull(),
  followersCount: text("followers_count").default("0").notNull(),
  followingCount: text("following_count").default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tweets = pgTable("tweets", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  authorId: text("author_id")
    .references(() => users.id)
    .notNull(),
  replyToId: text("reply_to_id"),
  likesCount: text("likes_count").default("0").notNull(),
  retweetsCount: text("retweets_count").default("0").notNull(),
  repliesCount: text("replies_count").default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .references(() => users.id)
      .notNull(),
    followingId: text("following_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followingId] })],
);

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    tweetId: text("tweet_id")
      .references(() => tweets.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tweetId] })],
);

export const retweets = pgTable(
  "retweets",
  {
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    tweetId: text("tweet_id")
      .references(() => tweets.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tweetId] })],
);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  recipientId: text("recipient_id")
    .references(() => users.id)
    .notNull(),
  actorId: text("actor_id")
    .references(() => users.id)
    .notNull(),
  tweetId: text("tweet_id").references(() => tweets.id),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
