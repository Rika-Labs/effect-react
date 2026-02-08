import { Schema } from "effect";

export const Timestamp = Schema.DateFromString.annotations({
  title: "Timestamp",
  description: "ISO 8601 date string",
});

export const PaginationCursor = Schema.Struct({
  cursor: Schema.optionalWith(Schema.String, { as: "Option" }),
  limit: Schema.optionalWith(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 50)), {
    default: () => 20,
  }),
});
export type PaginationCursor = typeof PaginationCursor.Type;

export const Paginated = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    items: Schema.Array(item),
    nextCursor: Schema.NullOr(Schema.String),
  });
