import { Context, Effect, Layer, Option } from "effect";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { FeedCursor, FeedPage, Tweet, User, UserProfile } from "@twitter-demo/shared";
import { NotFound } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { follows, likes, retweets, tweets, users } from "../db/schema.js";

const toUser = (row: typeof users.$inferSelect): User =>
  ({
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    followersCount: Number(row.followersCount),
    followingCount: Number(row.followingCount),
    createdAt: row.createdAt,
  }) as User;

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
    likesCount: Number(row.likesCount),
    retweetsCount: Number(row.retweetsCount),
    isLiked,
    isRetweeted,
    createdAt: row.createdAt,
  }) as Tweet;

export class UserService extends Context.Tag("UserService")<
  UserService,
  {
    readonly getProfile: (
      currentUserId: string,
      handle: string,
    ) => Effect.Effect<UserProfile, NotFound>;
    readonly follow: (
      currentUserId: string,
      handle: string,
    ) => Effect.Effect<void, NotFound>;
    readonly unfollow: (
      currentUserId: string,
      handle: string,
    ) => Effect.Effect<void, NotFound>;
    readonly followers: (
      handle: string,
    ) => Effect.Effect<{ readonly items: ReadonlyArray<User>; readonly nextCursor: string | null }, NotFound>;
    readonly following: (
      handle: string,
    ) => Effect.Effect<{ readonly items: ReadonlyArray<User>; readonly nextCursor: string | null }, NotFound>;
    readonly suggestions: (
      currentUserId: string,
    ) => Effect.Effect<ReadonlyArray<User>>;
    readonly likedTweets: (
      currentUserId: string,
      handle: string,
      cursor: FeedCursor,
    ) => Effect.Effect<FeedPage, NotFound>;
  }
>() {}

export const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const db = yield* Db;

    const findUserByHandle = (handle: string) =>
      Effect.gen(function* () {
        const row = yield* Effect.tryPromise({
          try: () => db.query.users.findFirst({ where: eq(users.handle, handle) }),
          catch: () => new NotFound({ message: "User not found" }),
        });
        if (!row) {
          return yield* new NotFound({ message: "User not found" });
        }
        return row;
      });

    return UserService.of({
      getProfile: (currentUserId, handle) =>
        Effect.gen(function* () {
          const row = yield* findUserByHandle(handle);
          const followRow = yield* Effect.promise(() =>
            db.query.follows.findFirst({
              where: and(
                eq(follows.followerId, currentUserId),
                eq(follows.followingId, row.id),
              ),
            }),
          );
          return {
            ...toUser(row),
            isFollowing: followRow != null,
          } as UserProfile;
        }),

      follow: (currentUserId, handle) =>
        Effect.gen(function* () {
          const target = yield* findUserByHandle(handle);
          yield* Effect.tryPromise({
            try: () =>
              db
                .insert(follows)
                .values({ followerId: currentUserId, followingId: target.id })
                .onConflictDoNothing(),
            catch: () => new NotFound({ message: "Failed to follow" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(users)
                .set({ followersCount: sql`${users.followersCount}::int + 1` })
                .where(eq(users.id, target.id)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(users)
                .set({ followingCount: sql`${users.followingCount}::int + 1` })
                .where(eq(users.id, currentUserId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
        }),

      unfollow: (currentUserId, handle) =>
        Effect.gen(function* () {
          const target = yield* findUserByHandle(handle);
          yield* Effect.tryPromise({
            try: () =>
              db
                .delete(follows)
                .where(
                  and(
                    eq(follows.followerId, currentUserId),
                    eq(follows.followingId, target.id),
                  ),
                ),
            catch: () => new NotFound({ message: "Failed to unfollow" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(users)
                .set({ followersCount: sql`GREATEST(${users.followersCount}::int - 1, 0)` })
                .where(eq(users.id, target.id)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
          yield* Effect.tryPromise({
            try: () =>
              db
                .update(users)
                .set({ followingCount: sql`GREATEST(${users.followingCount}::int - 1, 0)` })
                .where(eq(users.id, currentUserId)),
            catch: () => new NotFound({ message: "Failed to update count" }),
          });
        }),

      followers: (handle) =>
        Effect.gen(function* () {
          const target = yield* findUserByHandle(handle);
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ user: users })
                .from(follows)
                .innerJoin(users, eq(follows.followerId, users.id))
                .where(eq(follows.followingId, target.id))
                .limit(50),
            catch: () => new NotFound({ message: "Failed to fetch followers" }),
          });
          return {
            items: rows.map((r) => toUser(r.user)),
            nextCursor: null,
          };
        }),

      following: (handle) =>
        Effect.gen(function* () {
          const target = yield* findUserByHandle(handle);
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ user: users })
                .from(follows)
                .innerJoin(users, eq(follows.followingId, users.id))
                .where(eq(follows.followerId, target.id))
                .limit(50),
            catch: () => new NotFound({ message: "Failed to fetch following" }),
          });
          return {
            items: rows.map((r) => toUser(r.user)),
            nextCursor: null,
          };
        }),

      suggestions: (currentUserId) =>
        Effect.gen(function* () {
          const rows = yield* Effect.promise(() =>
            db
              .select()
              .from(users)
              .where(
                sql`${users.id} != ${currentUserId} AND ${users.id} NOT IN (SELECT ${follows.followingId} FROM follows WHERE ${follows.followerId} = ${currentUserId})`,
              )
              .orderBy(sql`RANDOM()`)
              .limit(3),
          );
          return rows.map(toUser);
        }),

      likedTweets: (currentUserId, handle, params) =>
        Effect.gen(function* () {
          const target = yield* findUserByHandle(handle);
          const limit = params.limit;
          const cursorOpt = params.cursor;

          let query = db
            .select({
              tweet: tweets,
              author: users,
              likeCreatedAt: likes.createdAt,
              isLiked: sql<boolean>`true`.as("is_liked"),
              isRetweeted: sql<boolean>`EXISTS(SELECT 1 FROM retweets WHERE retweets.user_id = ${currentUserId} AND retweets.tweet_id = ${tweets.id})`.as("is_retweeted"),
            })
            .from(likes)
            .innerJoin(tweets, eq(likes.tweetId, tweets.id))
            .innerJoin(users, eq(tweets.authorId, users.id))
            .where(eq(likes.userId, target.id))
            .orderBy(desc(likes.createdAt), desc(tweets.id))
            .limit(limit + 1)
            .$dynamic();

          if (Option.isSome(cursorOpt)) {
            const [cursorDate, cursorId] = cursorOpt.value.split("|");
            if (cursorDate && cursorId) {
              query = query.where(
                and(
                  eq(likes.userId, target.id),
                  or(
                    lt(likes.createdAt, new Date(cursorDate)),
                    and(eq(likes.createdAt, new Date(cursorDate)), lt(tweets.id, cursorId)),
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
              ? `${rows[rows.length - 2]!.likeCreatedAt.toISOString()}|${items[items.length - 1]!.id}`
              : null;

          return { items, nextCursor } as FeedPage;
        }),
    });
  }),
);
