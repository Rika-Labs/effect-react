import { Effect, Schema } from "effect";
import { defineAction } from "@effect-react/react/framework";

export const counterIncrement = defineAction({
  name: "counter.increment",
  input: Schema.Struct({
    value: Schema.Number,
  }),
  output: Schema.Struct({
    value: Schema.Number,
    message: Schema.String,
  }),
  error: Schema.Struct({
    reason: Schema.String,
  }),
  handler: ({ value }) =>
    value < 0
      ? Effect.fail({ reason: "counter.increment requires a non-negative number" })
      : Effect.succeed({
          value: value + 1,
          message: `Counter advanced to ${String(value + 1)}`,
        }),
});
