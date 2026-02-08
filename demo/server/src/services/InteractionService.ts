import { Context, Effect, Layer } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { NotFound } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { likes, notifications, retweets, tweets, users } from "../db/schema.js";

export class InteractionService extends Context.Tag("InteractionService")<
  InteractionService,
  {
    readonly like: (userId: string, tweetId: string) => Effect.Effect<void, NotFound>;
    readonly unlike: (userId: string, tweetId: string) => Effect.Effect<void, NotFound>;
    readonly retweet: (userId: string, tweetId: string) => Effect.Effect<void, NotFound>;
    readonly unretweet: (userId: string, tweetId: string) => Effect.Effect<void, NotFound>;
  }
>() {}

export const InteractionServiceLive = Layer.effect(
  InteractionService,
  Effect.gen(function* () {
    const db = yield* Db;

    const ensureTweetExists = (tweetId: string) =>
      Effect.gen(function* () {
        const tweet = yield* Effect.tryPromise({
          try: () => db.query.tweets.findFirst({ where: eq(tweets.id, tweetId) }),
          catch: () => new NotFound({ message: "Tweet not found" }),
        });
        if (!tweet) {
          return yield* new NotFound({ message: "Tweet not found" });
        }
        return tweet;
      });

    const createNotification = (
      type: string,
      recipientId: string,
      actorId: string,
      tweetId: string | null,
    ) =>
      Effect.promise(() =>
        db.insert(notifications).values({
          id: crypto.randomUUID(),
          type,
          recipientId,
          actorId,
          tweetId,
        }),
      );

    return InteractionService.of({
      like: (userId, tweetId) =>
        Effect.gen(function* () {
          const tweet = yield* ensureTweetExists(tweetId);
          yield* Effect.tryPromise({
            try: () =>
              db.insert(likes).values({ userId, tweetId }).onConflictDoNothing(),
            catch: () => new NotFound({ message: "Failed to like" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(tweets)
                .set({ likesCount: sql`${tweets.likesCount}::int + 1` })
                .where(eq(tweets.id, tweetId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
          if (tweet.authorId !== userId) {
            yield* createNotification("like", tweet.authorId, userId, tweetId);
          }
        }),

      unlike: (userId, tweetId) =>
        Effect.gen(function* () {
          yield* ensureTweetExists(tweetId);
          yield* Effect.tryPromise({
            try: () =>
              db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.tweetId, tweetId))),
            catch: () => new NotFound({ message: "Failed to unlike" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(tweets)
                .set({ likesCount: sql`GREATEST(${tweets.likesCount}::int - 1, 0)` })
                .where(eq(tweets.id, tweetId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
        }),

      retweet: (userId, tweetId) =>
        Effect.gen(function* () {
          const tweet = yield* ensureTweetExists(tweetId);
          yield* Effect.tryPromise({
            try: () =>
              db.insert(retweets).values({ userId, tweetId }).onConflictDoNothing(),
            catch: () => new NotFound({ message: "Failed to retweet" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(tweets)
                .set({ retweetsCount: sql`${tweets.retweetsCount}::int + 1` })
                .where(eq(tweets.id, tweetId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
          if (tweet.authorId !== userId) {
            yield* createNotification("retweet", tweet.authorId, userId, tweetId);
          }
        }),

      unretweet: (userId, tweetId) =>
        Effect.gen(function* () {
          yield* ensureTweetExists(tweetId);
          yield* Effect.tryPromise({
            try: () =>
              db
                .delete(retweets)
                .where(and(eq(retweets.userId, userId), eq(retweets.tweetId, tweetId))),
            catch: () => new NotFound({ message: "Failed to unretweet" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(tweets)
                .set({ retweetsCount: sql`GREATEST(${tweets.retweetsCount}::int - 1, 0)` })
                .where(eq(tweets.id, tweetId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
        }),
    });
  }),
);
