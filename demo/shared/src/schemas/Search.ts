import { Schema } from "effect";
import { Tweet } from "./Tweet.js";
import { User } from "./User.js";

export const SearchQuery = Schema.Struct({
  q: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  type: Schema.optionalWith(Schema.Literal("users", "tweets"), {
    default: () => "users" as const,
  }),
  limit: Schema.optionalWith(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 50)), {
    default: () => 20,
  }),
});
export type SearchQuery = typeof SearchQuery.Type;

export const SearchResults = Schema.Struct({
  users: Schema.Array(User),
  tweets: Schema.Array(Tweet),
});
export type SearchResults = typeof SearchResults.Type;
