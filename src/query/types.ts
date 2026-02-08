import type { BoundaryDecodeError } from "../boundary";
import type { BoundaryProtocolError } from "../boundary/errors";
import type { QueryRuntimeError } from "../data/types";

export {
  defineQuery,
  QueryRuntimeError,
  type QueryDefinition,
  type QueryPhase,
  type QuerySnapshot,
  type QueryRunOptions,
  type QueryRuntimeOptions,
} from "../data/types";

export type QueryError<E> =
  | E
  | BoundaryDecodeError
  | BoundaryProtocolError
  | QueryRuntimeError;
