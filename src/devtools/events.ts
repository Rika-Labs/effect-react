import { Effect, Stream } from "effect";
import { Telemetry, type TelemetryEvent } from "../kernel/telemetry";
import { createChannel, publish, subscribe } from "../realtime";

export type RuntimeEvent =
  | {
      readonly phase: "runtime-created" | "runtime-disposed";
      readonly timestamp: number;
      readonly detail?: unknown;
    }
  | {
      readonly phase: "run-fork" | "run-sync" | "run-promise";
      readonly timestamp: number;
      readonly detail?: unknown;
    };

export interface RuntimeEventSource {
  readonly emit: (event: RuntimeEvent) => Effect.Effect<void>;
  readonly stream: Stream.Stream<RuntimeEvent>;
}

export type DevtoolsEvent =
  | {
      readonly _tag: "telemetry";
      readonly timestamp: number;
      readonly event: TelemetryEvent;
    }
  | {
      readonly _tag: "runtime";
      readonly timestamp: number;
      readonly event: RuntimeEvent;
    };

export interface DevtoolsEventStream {
  readonly stream: Stream.Stream<DevtoolsEvent>;
}

export interface CreateDevtoolsEventStreamOptions {
  readonly telemetry: Stream.Stream<TelemetryEvent>;
  readonly runtime?: Stream.Stream<RuntimeEvent>;
}

export interface CreateDevtoolsEventStreamFromTelemetryOptions {
  readonly runtime?: Stream.Stream<RuntimeEvent>;
}

const emptyRuntimeStream = (): Stream.Stream<RuntimeEvent> =>
  Stream.fromIterable<RuntimeEvent>([]);

const wrapTelemetryEvent = (event: TelemetryEvent): DevtoolsEvent => ({
  _tag: "telemetry",
  timestamp: event.timestamp,
  event,
});

const wrapRuntimeEvent = (event: RuntimeEvent): DevtoolsEvent => ({
  _tag: "runtime",
  timestamp: event.timestamp,
  event,
});

export const createRuntimeEventSource = (): Effect.Effect<RuntimeEventSource> =>
  Effect.map(createChannel<RuntimeEvent>(), (channel) => ({
    emit: (event) => publish(channel, event),
    stream: subscribe(channel),
  }));

export const createDevtoolsEventStream = (
  options: CreateDevtoolsEventStreamOptions,
): DevtoolsEventStream => {
  const telemetry = options.telemetry.pipe(Stream.map(wrapTelemetryEvent));
  const runtime = (options.runtime ?? emptyRuntimeStream()).pipe(Stream.map(wrapRuntimeEvent));

  return {
    stream: Stream.merge(telemetry, runtime),
  };
};

export const createDevtoolsEventStreamFromTelemetry = (
  options: CreateDevtoolsEventStreamFromTelemetryOptions = {},
): Effect.Effect<DevtoolsEventStream, never, Telemetry> =>
  Effect.map(Telemetry, (telemetry) =>
    createDevtoolsEventStream({
      telemetry: telemetry.stream,
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
    }),
  );
