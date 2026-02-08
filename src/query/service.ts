import { Effect } from "effect";
import { Data, fetchQuery as fetchDataQuery } from "../data";
import type { BoundaryDecodeError } from "../boundary";
import type { BoundaryProtocolError } from "../boundary/errors";
import type { QueryDefinition, QueryRuntimeError } from "./types";

export const fetchQuery = fetchDataQuery;

export const prefetchQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
): Effect.Effect<void, E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError, Data> =>
  Effect.flatMap(Data, (service) => service.prefetch(definition, input));

export const invalidateQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
): Effect.Effect<void, QueryRuntimeError, Data> =>
  Effect.flatMap(Data, (service) => service.invalidate(definition, input));

export const prefetch = prefetchQuery;
export const invalidate = invalidateQuery;
