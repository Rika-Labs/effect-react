import { Context, Effect, Layer } from "effect";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export class Db extends Context.Tag("Db")<Db, DbClient>() {}

export const DbLive = Layer.scoped(
  Db,
  Effect.acquireRelease(
    Effect.sync(() => {
      const sql = postgres(
        process.env.DATABASE_URL ?? "postgres://twitter:twitter@localhost:5432/twitter",
      );
      return drizzle(sql, { schema });
    }),
    () => Effect.sync(() => {}),
  ),
);
