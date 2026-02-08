import { Cause, Context, Effect, Layer, Schema } from "effect";
import type { ParseResult } from "effect";
import {
  BoundaryDecodeError,
  BoundaryProtocolError,
  BoundaryTransportError,
  type BoundaryError,
} from "./errors";

export interface BoundaryService {
  readonly decodeUnknown: <A, I>(options: {
    readonly source: string;
    readonly schema: Schema.Schema<A, I, never>;
    readonly value: unknown;
  }) => Effect.Effect<A, BoundaryDecodeError, never>;
  readonly decodeTextJson: <A, I>(options: {
    readonly source: string;
    readonly schema: Schema.Schema<A, I, never>;
    readonly text: string;
  }) => Effect.Effect<A, BoundaryError, never>;
  readonly encode: <A, I>(options: {
    readonly source: string;
    readonly schema: Schema.Schema<A, I, never>;
    readonly value: A;
  }) => Effect.Effect<I, BoundaryError, never>;
}

export class Boundary extends Context.Tag("EffectReact/Boundary")<Boundary, BoundaryService>() {}

const parseErrorMessage = (error: ParseResult.ParseError): string =>
  Cause.pretty(Cause.fail(error)).trim();

export const makeBoundaryService = (): BoundaryService => ({
  decodeUnknown: ({ source, schema, value }) =>
    Schema.decodeUnknown(schema)(value).pipe(
      Effect.mapError(
        (error) => new BoundaryDecodeError(source, parseErrorMessage(error), error),
      ),
    ),
  decodeTextJson: ({ source, schema, text }) =>
    Effect.gen(function* () {
      const payload = yield* Effect.try({
        try: () => JSON.parse(text) as unknown,
        catch: (cause) =>
          new BoundaryTransportError(source, "failed to parse JSON payload", cause),
      });

      return yield* Schema.decodeUnknown(schema)(payload).pipe(
        Effect.mapError(
          (error) => new BoundaryDecodeError(source, parseErrorMessage(error), error),
        ),
      );
    }),
  encode: ({ source, schema, value }) =>
    Schema.encode(schema)(value).pipe(
      Effect.mapError((error) => new BoundaryProtocolError(source, parseErrorMessage(error))),
    ),
});

export const BoundaryLive = Layer.succeed(Boundary, makeBoundaryService());

export const decodeUnknown = <A, I>(options: {
  readonly source: string;
  readonly schema: Schema.Schema<A, I, never>;
  readonly value: unknown;
}): Effect.Effect<A, BoundaryDecodeError, Boundary> =>
  Effect.flatMap(Boundary, (service) => service.decodeUnknown(options));

export const decodeTextJson = <A, I>(options: {
  readonly source: string;
  readonly schema: Schema.Schema<A, I, never>;
  readonly text: string;
}): Effect.Effect<A, BoundaryError, Boundary> =>
  Effect.flatMap(Boundary, (service) => service.decodeTextJson(options));

export const encode = <A, I>(options: {
  readonly source: string;
  readonly schema: Schema.Schema<A, I, never>;
  readonly value: A;
}): Effect.Effect<I, BoundaryError, Boundary> =>
  Effect.flatMap(Boundary, (service) => service.encode(options));
