import {
  Cache,
  Context,
  Effect,
  Layer,
  SubscriptionRef,
  type Stream,
} from "effect";
import { Boundary, type BoundaryDecodeError } from "../boundary";
import type { BoundaryProtocolError } from "../boundary/errors";
import { Telemetry } from "../kernel/telemetry";
import {
  type QueryDefinition,
  type QueryRunOptions,
  type QueryRuntimeOptions,
  type QuerySnapshot,
  QueryRuntimeError,
} from "./types";

const defaultRuntimeOptions: Required<QueryRuntimeOptions> = {
  capacity: 2048,
  timeToLive: "5 minutes",
};

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
};

const initialSnapshot = <Output, E>(key: string): QuerySnapshot<Output, E> => ({
  key,
  phase: "initial",
  data: undefined,
  error: undefined,
  updatedAt: null,
});

export interface DataService {
  readonly fetch: <Name extends string, Input, Output, E>(
    definition: QueryDefinition<Name, Input, Output, E>,
    input: unknown,
    options?: QueryRunOptions,
  ) => Effect.Effect<Output, E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError, never>;
  readonly prefetch: <Name extends string, Input, Output, E>(
    definition: QueryDefinition<Name, Input, Output, E>,
    input: unknown,
  ) => Effect.Effect<void, E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError, never>;
  readonly invalidate: <Name extends string, Input, Output, E>(
    definition: QueryDefinition<Name, Input, Output, E>,
    input: unknown,
  ) => Effect.Effect<void, QueryRuntimeError, never>;
  readonly getSnapshot: <Name extends string, Input, Output, E>(
    definition: QueryDefinition<Name, Input, Output, E>,
    input: unknown,
  ) => Effect.Effect<QuerySnapshot<Output, E>, never, never>;
  readonly getAllSnapshots: Effect.Effect<ReadonlyMap<string, QuerySnapshot<unknown, unknown>>, never, never>;
  readonly hydrateSnapshots: (
    snapshots: ReadonlyMap<string, QuerySnapshot<unknown, unknown>>,
  ) => Effect.Effect<void, never, never>;
  readonly snapshots: Stream.Stream<ReadonlyMap<string, QuerySnapshot<unknown, unknown>>>;
}

export class Data extends Context.Tag("EffectReact/Data")<Data, DataService>() {}

export const makeDataLayer = (
  options: QueryRuntimeOptions = {},
): Layer.Layer<Data, never, Boundary | Telemetry> => {
  const merged = {
    ...defaultRuntimeOptions,
    ...options,
  };

  return Layer.effect(
    Data,
    Effect.gen(function* () {
      const boundary = yield* Boundary;
      const telemetry = yield* Telemetry;
      const lookups = new Map<string, Effect.Effect<unknown, unknown, never>>();
      const snapshots = yield* SubscriptionRef.make(
        new Map<string, QuerySnapshot<unknown, unknown>>() as ReadonlyMap<
          string,
          QuerySnapshot<unknown, unknown>
        >,
      );

      const cache = yield* Cache.make<string, unknown, unknown>({
        capacity: merged.capacity,
        timeToLive: merged.timeToLive,
        lookup: (key) =>
          Effect.suspend(() => {
            const lookup = lookups.get(key);
            if (lookup === undefined) {
              return Effect.fail(new QueryRuntimeError(`No query executor registered for ${key}`));
            }
            return lookup;
          }),
      });

      const setSnapshot = <Output, E>(
        key: string,
        update: (previous: QuerySnapshot<Output, E>) => QuerySnapshot<Output, E>,
      ): Effect.Effect<void> =>
        SubscriptionRef.update(snapshots, (current) => {
          const next = new Map(current);
          const previous =
            (next.get(key) as QuerySnapshot<Output, E> | undefined) ?? initialSnapshot<Output, E>(key);
          next.set(key, update(previous));
          return next;
        }).pipe(Effect.asVoid);

      const buildKey = <Name extends string, Input, Output, E>(
        definition: QueryDefinition<Name, Input, Output, E>,
        input: Input,
      ): string => {
        const base = definition.key ? definition.key(input) : input;
        return `${definition.name}:${stableStringify(base)}`;
      };

      const fetch = <Name extends string, Input, Output, E>(
        definition: QueryDefinition<Name, Input, Output, E>,
        input: unknown,
        runOptions?: QueryRunOptions,
      ): Effect.Effect<
        Output,
        E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError,
        never
      > =>
        Effect.gen(function* () {
          const decodedInput = yield* boundary.decodeUnknown({
            source: `query:${definition.name}:input`,
            schema: definition.input,
            value: input,
          });

          const key = buildKey(definition, decodedInput);
          yield* telemetry.emit({
            _tag: "query",
            phase: "start",
            key,
            timestamp: Date.now(),
          });

          yield* setSnapshot(key, (previous) => ({
            ...previous,
            phase: "loading",
            error: undefined,
          }));

          lookups.set(
            key,
            definition
              .run(decodedInput)
              .pipe(
                Effect.flatMap((output) =>
                  boundary.decodeUnknown({
                    source: `query:${definition.name}:output`,
                    schema: definition.output,
                    value: output,
                  }),
                ),
              ) as Effect.Effect<unknown, unknown, never>,
          );

          if (runOptions?.forceRefresh === true) {
            yield* cache.refresh(key).pipe(Effect.ignore);
          }

          const value = yield* cache.get(key).pipe(
            Effect.mapError(
              (error) =>
                error as E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError,
            ),
          );

          yield* setSnapshot(key, () => ({
            key,
            phase: "success",
            data: value,
            error: undefined,
            updatedAt: Date.now(),
          }));

          yield* telemetry.emit({
            _tag: "query",
            phase: "success",
            key,
            timestamp: Date.now(),
          });

          return value as Output;
        }).pipe(
          Effect.tapError((error) =>
            Effect.gen(function* () {
              const decodedInput = yield* boundary.decodeUnknown({
                source: `query:${definition.name}:input`,
                schema: definition.input,
                value: input,
              });
              const key = buildKey(definition, decodedInput);
              yield* setSnapshot(key, (previous) => ({
                ...previous,
                phase: "failure",
                error,
                updatedAt: previous.updatedAt,
              }));
              yield* telemetry.emit({
                _tag: "query",
                phase: "failure",
                key,
                timestamp: Date.now(),
                detail: error,
              });
            }),
          ),
        );

      const prefetch: DataService["prefetch"] = (definition, input) =>
        fetch(definition, input).pipe(Effect.asVoid);

      const invalidate: DataService["invalidate"] = (definition, input) =>
        Effect.gen(function* () {
          const key = `${definition.name}:${stableStringify(input)}`;
          yield* cache.invalidate(key);
          yield* SubscriptionRef.update(snapshots, (current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
          }).pipe(Effect.asVoid);
          yield* telemetry.emit({
            _tag: "query",
            phase: "invalidate",
            key,
            timestamp: Date.now(),
          });
        });

      const getSnapshot = <Name extends string, Input, Output, E>(
        definition: QueryDefinition<Name, Input, Output, E>,
        input: unknown,
      ): Effect.Effect<QuerySnapshot<Output, E>, never, never> =>
        Effect.gen(function* () {
          const key = `${definition.name}:${stableStringify(input)}`;
          const current = yield* SubscriptionRef.get(snapshots);
          const snapshot = current.get(key);
          if (snapshot === undefined) {
            return initialSnapshot<Output, E>(key);
          }
          return snapshot as QuerySnapshot<Output, E>;
        });

      return {
        fetch,
        prefetch,
        invalidate,
        getSnapshot,
        getAllSnapshots: SubscriptionRef.get(snapshots),
        hydrateSnapshots: (nextSnapshots) => SubscriptionRef.set(snapshots, new Map(nextSnapshots)),
        snapshots: snapshots.changes,
      } satisfies DataService;
    }),
  );
};

export const fetchQuery = <Name extends string, Input, Output, E>(
  definition: QueryDefinition<Name, Input, Output, E>,
  input: unknown,
  options?: QueryRunOptions,
): Effect.Effect<Output, E | BoundaryDecodeError | BoundaryProtocolError | QueryRuntimeError, Data> =>
  Effect.flatMap(Data, (service) => service.fetch(definition, input, options));
