import { Context, Effect, Layer } from "effect";
import { eq, ilike, or, sql } from "drizzle-orm";
import type { SearchQuery, SearchResults, Tweet, User } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { likes, retweets, tweets, users } from "../db/schema.js";

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

export class SearchService extends Context.Tag("SearchService")<
  SearchService,
  {
    readonly search: (
      currentUserId: string,
      query: SearchQuery,
    ) => Effect.Effect<SearchResults>;
  }
>() {}

export const SearchServiceLive = Layer.effect(
  SearchService,
  Effect.gen(function* () {
    const db = yield* Db;

    return SearchService.of({
      search: (currentUserId, params) =>
        Effect.gen(function* () {
          const pattern = `%${params.q}%`;

          if (params.type === "tweets") {
            const rows = yield* Effect.promise(() =>
              db
                .select({
                  tweet: tweets,
                  author: users,
                  isLiked: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.user_id = ${currentUserId} AND likes.tweet_id = ${tweets.id})`.as("is_liked"),
                  isRetweeted: sql<boolean>`EXISTS(SELECT 1 FROM retweets WHERE retweets.user_id = ${currentUserId} AND retweets.tweet_id = ${tweets.id})`.as("is_retweeted"),
                })
                .from(tweets)
                .innerJoin(users, eq(tweets.authorId, users.id))
                .where(ilike(tweets.content, pattern))
                .limit(params.limit),
            );
            return {
              users: [],
              tweets: rows.map((r) => toTweet(r.tweet, r.author, Boolean(r.isLiked), Boolean(r.isRetweeted))),
            } as SearchResults;
          }

          const rows = yield* Effect.promise(() =>
            db
              .select()
              .from(users)
              .where(or(ilike(users.handle, pattern), ilike(users.displayName, pattern)))
              .limit(params.limit),
          );
          return {
            users: rows.map(toUser),
            tweets: [],
          } as SearchResults;
        }),
    });
  }),
);
