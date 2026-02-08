import { Context, Effect, Layer, PubSub, Stream } from "effect";

export type TelemetryEvent =
  | {
      readonly _tag: "query";
      readonly phase: "start" | "success" | "failure" | "invalidate";
      readonly key: string;
      readonly timestamp: number;
      readonly detail?: unknown;
    }
  | {
      readonly _tag: "navigation";
      readonly phase: "start" | "success" | "failure" | "cancel";
      readonly pathname: string;
      readonly routeId?: string;
      readonly timestamp: number;
      readonly detail?: unknown;
    }
  | {
      readonly _tag: "action";
      readonly phase: "start" | "success" | "failure" | "transport";
      readonly name: string;
      readonly timestamp: number;
      readonly detail?: unknown;
    }
  | {
      readonly _tag: "boundary";
      readonly phase: "decode-failure" | "protocol-failure" | "transport-failure";
      readonly source: string;
      readonly timestamp: number;
      readonly detail?: unknown;
    };

export interface TelemetryService {
  readonly emit: (event: TelemetryEvent) => Effect.Effect<void>;
  readonly stream: Stream.Stream<TelemetryEvent>;
}

export class Telemetry extends Context.Tag("EffectReact/Telemetry")<
  Telemetry,
  TelemetryService
>() {}

export const TelemetryLive = Layer.effect(
  Telemetry,
  Effect.map(PubSub.unbounded<TelemetryEvent>(), (pubsub) => ({
    emit: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
    stream: Stream.fromPubSub(pubsub),
  })),
);

export const emitTelemetry = (event: TelemetryEvent): Effect.Effect<void, never, Telemetry> =>
  Effect.flatMap(Telemetry, (service) => service.emit(event));
