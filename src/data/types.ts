import type { Duration, Effect, Schema } from "effect";
import type { BoundaryDecodeError } from "../boundary";
import type { BoundaryProtocolError } from "../boundary/errors";

export interface QueryDefinition<
  Name extends string,
  Input,
  Output,
  E,
  InputEncoded = Input,
  OutputEncoded = Output,
> {
  readonly name: Name;
  readonly input: Schema.Schema<Input, InputEncoded, never>;
  readonly output: Schema.Schema<Output, OutputEncoded, never>;
  readonly run: (input: Input) => Effect.Effect<Output, E, never>;
  readonly key?: (input: Input) => unknown;
}

export const defineQuery = <
  Name extends string,
  Input,
  Output,
  E,
  InputEncoded = Input,
  OutputEncoded = Output,
>(
  definition: QueryDefinition<Name, Input, Output, E, InputEncoded, OutputEncoded>,
): QueryDefinition<Name, Input, Output, E, InputEncoded, OutputEncoded> => definition;

export type QueryPhase = "initial" | "loading" | "success" | "failure";

export interface QuerySnapshot<Output, E> {
  readonly key: string;
  readonly phase: QueryPhase;
  readonly data: Output | undefined;
  readonly error: E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError | undefined;
  readonly updatedAt: number | null | undefined;
}

export interface QueryRunOptions {
  readonly forceRefresh?: boolean;
}

export interface QueryRuntimeOptions {
  readonly capacity?: number;
  readonly timeToLive?: Duration.DurationInput;
}

export class QueryRuntimeError extends Error {
  readonly _tag = "QueryRuntimeError" as const;

  constructor(readonly messageText: string) {
    super(messageText);
    this.name = "QueryRuntimeError";
  }
}
