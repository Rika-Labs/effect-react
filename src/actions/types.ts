import type { Effect, Schema } from "effect";
import type { BoundaryError } from "../boundary";

export interface ActionDefinition<
  Name extends string,
  Input,
  Output,
  E,
  InputEncoded = Input,
  OutputEncoded = Output,
  ErrorEncoded = E,
> {
  readonly name: Name;
  readonly input: Schema.Schema<Input, InputEncoded, never>;
  readonly output: Schema.Schema<Output, OutputEncoded, never>;
  readonly error: Schema.Schema<E, ErrorEncoded, never>;
  readonly handler: (input: Input) => Effect.Effect<Output, E, never>;
}

export const defineAction = <
  Name extends string,
  Input,
  Output,
  E,
  InputEncoded = Input,
  OutputEncoded = Output,
  ErrorEncoded = E,
>(
  definition: ActionDefinition<Name, Input, Output, E, InputEncoded, OutputEncoded, ErrorEncoded>,
): ActionDefinition<Name, Input, Output, E, InputEncoded, OutputEncoded, ErrorEncoded> =>
  definition;

export interface AnyActionDefinition {
  readonly name: string;
  readonly input: Schema.Schema.All;
  readonly output: Schema.Schema.All;
  readonly error: Schema.Schema.All;
  readonly handler: (input: never) => Effect.Effect<unknown, unknown, never>;
}

export type ActionError<E> = E | BoundaryError | ActionRuntimeError;

export class ActionRuntimeError extends Error {
  readonly _tag = "ActionRuntimeError" as const;

  constructor(readonly messageText: string) {
    super(messageText);
    this.name = "ActionRuntimeError";
  }
}

export type ActionWireResult =
  | {
      readonly _tag: "success";
      readonly value: unknown;
    }
  | {
      readonly _tag: "failure";
      readonly error: unknown;
    }
  | {
      readonly _tag: "defect";
      readonly message: string;
    };
