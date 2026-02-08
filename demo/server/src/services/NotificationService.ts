import { Context, Effect, Layer, Option } from "effect";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { NotificationList, PaginationCursor } from "@twitter-demo/shared";
import { TweetId, UserId } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { notifications, users } from "../db/schema.js";

export class NotificationService extends Context.Tag("NotificationService")<
  NotificationService,
  {
    readonly list: (
      userId: string,
      params: PaginationCursor,
    ) => Effect.Effect<NotificationList>;
    readonly markRead: (userId: string, ids: ReadonlyArray<string>) => Effect.Effect<void>;
  }
>() {}

export const NotificationServiceLive = Layer.effect(
  NotificationService,
  Effect.gen(function* () {
    const db = yield* Db;

    return NotificationService.of({
      list: (userId, params) =>
        Effect.gen(function* () {
          const limit = params.limit;
          const cursorOpt = params.cursor;

          let query = db
            .select({
              notification: notifications,
              actorHandle: users.handle,
              actorDisplayName: users.displayName,
            })
            .from(notifications)
            .innerJoin(users, eq(notifications.actorId, users.id))
            .where(eq(notifications.recipientId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit + 1)
            .$dynamic();

          if (Option.isSome(cursorOpt)) {
            const cursorDate = cursorOpt.value;
            query = query.where(
              and(
                eq(notifications.recipientId, userId),
                lt(notifications.createdAt, new Date(cursorDate)),
              ),
            );
          }

          const rows = yield* Effect.promise(() => query);

          const unreadCountResult = yield* Effect.promise(() =>
            db
              .select({ count: sql<number>`count(*)` })
              .from(notifications)
              .where(
                and(
                  eq(notifications.recipientId, userId),
                  eq(notifications.read, false),
                ),
              ),
          );

          const items = rows.slice(0, limit).map((r) => ({
            id: r.notification.id,
            type: r.notification.type as "like" | "retweet" | "follow",
            actorId: r.notification.actorId as UserId,
            actorHandle: r.actorHandle,
            actorDisplayName: r.actorDisplayName,
            tweetId: r.notification.tweetId as TweetId | null,
            read: r.notification.read,
            createdAt: r.notification.createdAt,
          }));

          const nextCursor =
            rows.length > limit
              ? items[items.length - 1]!.createdAt.toISOString()
              : null;

          return {
            items,
            nextCursor,
            unreadCount: Number(unreadCountResult[0]?.count ?? 0),
          } as NotificationList;
        }),

      markRead: (userId, ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return;
          yield* Effect.promise(() =>
            db
              .update(notifications)
              .set({ read: true })
              .where(
                and(
                  eq(notifications.recipientId, userId),
                  inArray(notifications.id, ids as string[]),
                ),
              ),
          );
        }),
    });
  }),
);
