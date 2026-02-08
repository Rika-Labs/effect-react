import { Context, Effect, Layer, Option } from "effect";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { CreateTweet, FeedCursor, FeedPage, Tweet } from "@twitter-demo/shared";
import { NotFound, Unauthorized } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { likes, retweets, tweets, users } from "../db/schema.js";

const toTweet = (
  row: typeof tweets.$inferSelect,
  author: typeof users.$inferSelect,
  isLiked: boolean,
  isRetweeted: boolean,
): Tweet =>
  ({
    id: row.id,
    content: row.content,
    authorId: row.authorId,
    authorHandle: author.handle,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    replyToId: row.replyToId,
    likesCount: Number(row.likesCount),
    retweetsCount: Number(row.retweetsCount),
    repliesCount: Number(row.repliesCount),
    isLiked,
    isRetweeted,
    createdAt: row.createdAt,
  }) as Tweet;

export class TweetService extends Context.Tag("TweetService")<
  TweetService,
  {
    readonly create: (
      userId: string,
      input: CreateTweet,
    ) => Effect.Effect<Tweet>;
    readonly feed: (
      userId: string,
      cursor: FeedCursor,
    ) => Effect.Effect<FeedPage>;
    readonly getById: (
      userId: string,
      tweetId: string,
    ) => Effect.Effect<Tweet, NotFound>;
    readonly getReplies: (
      userId: string,
      tweetId: string,
      cursor: FeedCursor,
    ) => Effect.Effect<FeedPage, NotFound>;
    readonly remove: (
      userId: string,
      tweetId: string,
    ) => Effect.Effect<void, NotFound | Unauthorized>;
  }
>() {}

export const TweetServiceLive = Layer.effect(
  TweetService,
  Effect.gen(function* () {
    const db = yield* Db;

    return TweetService.of({
      create: (userId, input) =>
        Effect.gen(function* () {
          const author = yield* Effect.promise(() =>
            db.query.users.findFirst({ where: eq(users.id, userId) }),
          ).pipe(
            Effect.flatMap((user) =>
              user
                ? Effect.succeed(user)
                : Effect.dieMessage("User must exist after authentication"),
            ),
          );
          const id = crypto.randomUUID();
          const now = new Date();
          const replyToId = Option.isSome(input.replyToId) ? input.replyToId.value : null;
          yield* Effect.promise(() =>
            db.insert(tweets).values({
              id,
              content: input.content,
              authorId: userId,
              replyToId,
              createdAt: now,
            }),
          );
          // Increment repliesCount on parent tweet
          if (replyToId) {
            yield* Effect.promise(() =>
              db.execute(sql`UPDATE tweets SET replies_count = (CAST(replies_count AS integer) + 1)::text WHERE id = ${replyToId}`),
            );
          }
          return toTweet(
            { id, content: input.content, authorId: userId, replyToId, likesCount: "0", retweetsCount: "0", repliesCount: "0", createdAt: now },
            author,
            false,
            false,
          );
        }),

      feed: (userId, params) =>
        Effect.gen(function* () {
          const limit = params.limit;
          const cursorOpt = params.cursor;

          let query = db
            .select({
              tweet: tweets,
              author: users,
              isLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.user_id = ${userId} AND likes.tweet_id = ${tweets.id})`.as("is_liked"),
              isRetweeted: sql<boolean>`EXISTS(SELECT 1 FROM retweets WHERE retweets.user_id = ${userId} AND retweets.tweet_id = ${tweets.id})`.as("is_retweeted"),
            })
            .from(tweets)
            .innerJoin(users, eq(tweets.authorId, users.id))
            .orderBy(desc(tweets.createdAt), desc(tweets.id))
            .limit(limit + 1)
            .$dynamic();

          if (Option.isSome(cursorOpt)) {
            const [cursorDate, cursorId] = cursorOpt.value.split("|");
            if (cursorDate && cursorId) {
              query = query.where(
                or(
                  lt(tweets.createdAt, new Date(cursorDate)),
                  and(eq(tweets.createdAt, new Date(cursorDate)), lt(tweets.id, cursorId)),
                ),
              );
            }
          }

          const rows = yield* Effect.promise(() => query);

          const items = rows.slice(0, limit).map((r) =>
            toTweet(r.tweet, r.author, Boolean(r.isLiked), Boolean(r.isRetweeted)),
          );

          const nextCursor =
            rows.length > limit
              ? `${items[items.length - 1]!.createdAt.toISOString()}|${items[items.length - 1]!.id}`
              : null;

          return { items, nextCursor } as FeedPage;
        }),

      getById: (userId, tweetId) =>
        Effect.gen(function* () {
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({
                  tweet: tweets,
                  author: users,
                  isLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.user_id = ${userId} AND likes.tweet_id = ${tweets.id})`.as("is_liked"),
                  isRetweeted: sql<boolean>`EXISTS(SELECT 1 FROM retweets WHERE retweets.user_id = ${userId} AND retweets.tweet_id = ${tweets.id})`.as("is_retweeted"),
                })
                .from(tweets)
                .innerJoin(users, eq(tweets.authorId, users.id))
                .where(eq(tweets.id, tweetId))
                .limit(1),
            catch: () => new NotFound({ message: "Tweet not found" }),
          });
          const row = rows[0];
          if (!row) {
            return yield* new NotFound({ message: "Tweet not found" });
          }
          return toTweet(row.tweet, row.author, Boolean(row.isLiked), Boolean(row.isRetweeted));
        }),

      getReplies: (userId, tweetId, params) =>
        Effect.gen(function* () {
          const limit = params.limit;
          const cursorOpt = params.cursor;

          // Verify tweet exists
          const parent = yield* Effect.promise(() =>
            db.query.tweets.findFirst({ where: eq(tweets.id, tweetId) }),
          );
          if (!parent) {
            return yield* new NotFound({ message: "Tweet not found" });
          }

          let query = db
            .select({
              tweet: tweets,
              author: users,
              isLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.user_id = ${userId} AND likes.tweet_id = ${tweets.id})`.as("is_liked"),
              isRetweeted: sql<boolean>`EXISTS(SELECT 1 FROM retweets WHERE retweets.user_id = ${userId} AND retweets.tweet_id = ${tweets.id})`.as("is_retweeted"),
            })
            .from(tweets)
            .innerJoin(users, eq(tweets.authorId, users.id))
            .where(eq(tweets.replyToId, tweetId))
            .orderBy(desc(tweets.createdAt), desc(tweets.id))
            .limit(limit + 1)
            .$dynamic();

          if (Option.isSome(cursorOpt)) {
            const [cursorDate, cursorId] = cursorOpt.value.split("|");
            if (cursorDate && cursorId) {
              query = query.where(
                and(
                  eq(tweets.replyToId, tweetId),
                  or(
                    lt(tweets.createdAt, new Date(cursorDate)),
                    and(eq(tweets.createdAt, new Date(cursorDate)), lt(tweets.id, cursorId)),
                  ),
                ),
              );
            }
          }

          const rows = yield* Effect.promise(() => query);

          const items = rows.slice(0, limit).map((r) =>
            toTweet(r.tweet, r.author, Boolean(r.isLiked), Boolean(r.isRetweeted)),
          );

          const nextCursor =
            rows.length > limit
              ? `${items[items.length - 1]!.createdAt.toISOString()}|${items[items.length - 1]!.id}`
              : null;

          return { items, nextCursor } as FeedPage;
        }),

      remove: (userId, tweetId) =>
        Effect.gen(function* () {
          const tweet = yield* Effect.tryPromise({
            try: () => db.query.tweets.findFirst({ where: eq(tweets.id, tweetId) }),
            catch: () => new NotFound({ message: "Tweet not found" }),
          });
          if (!tweet) {
            return yield* new NotFound({ message: "Tweet not found" });
          }
          if (tweet.authorId !== userId) {
            return yield* new Unauthorized({ message: "Not authorized to delete this tweet" });
          }
          yield* Effect.tryPromise({
            try: () => db.delete(tweets).where(eq(tweets.id, tweetId)),
            catch: () => new NotFound({ message: "Failed to delete tweet" }),
          });
        }),
    });
  }),
);
