import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  createDevtoolsEventStream,
  createDevtoolsEventStreamFromTelemetry,
  createRuntimeEventSource,
  type RuntimeEvent,
} from "../../devtools";
import { Telemetry, type TelemetryEvent } from "../../kernel";
import { createChannel, createPresence, publish, subscribe } from "../../realtime";

describe("realtime and devtools modules", () => {
  it("publishes and subscribes through realtime channels", async () => {
    const messages = await Effect.runPromise(
      Effect.gen(function* () {
        const channel = yield* createChannel<number>();
        const collector = yield* Effect.fork(
          Stream.runCollect(subscribe(channel).pipe(Stream.take(2))),
        );

        yield* Effect.yieldNow();
        yield* publish(channel, 1);
        yield* publish(channel, 2);

        return yield* Fiber.join(collector);
      }),
    );

    expect(Array.from(messages)).toEqual([1, 2]);
  });

  it("tracks presence join and leave events", async () => {
    const snapshots = await Effect.runPromise(
      Effect.gen(function* () {
        const presence = yield* createPresence<
          string,
          { readonly id: string; readonly name: string }
        >({
          identify: (member) => member.id,
        });

        const collector = yield* Effect.fork(
          Stream.runCollect(presence.members.pipe(Stream.take(3))),
        );

        yield* Effect.yieldNow();
        yield* presence.join({ id: "ada", name: "Ada" });
        yield* presence.leave("ada");

        return yield* Fiber.join(collector);
      }),
    );

    const maps = Array.from(snapshots);

    expect(Object.fromEntries(maps[0] ?? [])).toEqual({});
    expect(Object.fromEntries(maps[1] ?? [])).toEqual({
      ada: { id: "ada", name: "Ada" },
    });
    expect(Object.fromEntries(maps[2] ?? [])).toEqual({});
  });

  it("wraps telemetry and runtime streams for devtools consumers", async () => {
    const telemetryEvent: TelemetryEvent = {
      _tag: "query",
      phase: "success",
      key: "users.all",
      timestamp: 100,
      detail: { count: 2 },
    };

    const runtimeEvent: RuntimeEvent = {
      phase: "runtime-disposed",
      timestamp: 200,
      detail: { reason: "test" },
    };

    const events = await Effect.runPromise(
      Stream.runCollect(
        createDevtoolsEventStream({
          telemetry: Stream.fromIterable([telemetryEvent]),
          runtime: Stream.fromIterable([runtimeEvent]),
        }).stream,
      ),
    );

    const collected = Array.from(events);

    expect(collected).toHaveLength(2);
    expect(collected.some((event) => event._tag === "telemetry")).toBe(true);
    expect(collected.some((event) => event._tag === "runtime")).toBe(true);

    const runtime = collected.find((event) => event._tag === "runtime");
    const telemetry = collected.find((event) => event._tag === "telemetry");

    if (runtime !== undefined && runtime._tag === "runtime") {
      expect(runtime.event.phase).toBe("runtime-disposed");
    }

    if (telemetry !== undefined && telemetry._tag === "telemetry") {
      expect(telemetry.event._tag).toBe("query");
    }
  });

  it("creates runtime event source streams that emit published runtime events", async () => {
    const created: RuntimeEvent = {
      phase: "runtime-created",
      timestamp: 300,
      detail: { source: "test" },
    };

    const disposed: RuntimeEvent = {
      phase: "runtime-disposed",
      timestamp: 301,
      detail: { source: "test" },
    };

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* createRuntimeEventSource();
        const collector = yield* Effect.fork(Stream.runCollect(source.stream.pipe(Stream.take(2))));

        yield* Effect.yieldNow();
        yield* source.emit(created);
        yield* source.emit(disposed);

        return yield* Fiber.join(collector);
      }),
    );

    expect(Array.from(events)).toEqual([created, disposed]);
  });

  it("wraps telemetry-only streams when no runtime stream is provided", async () => {
    const telemetryEvent: TelemetryEvent = {
      _tag: "navigation",
      phase: "success",
      pathname: "/",
      routeId: "home",
      timestamp: 400,
    };

    const events = await Effect.runPromise(
      Stream.runCollect(
        createDevtoolsEventStream({
          telemetry: Stream.fromIterable([telemetryEvent]),
        }).stream,
      ),
    );

    const collected = Array.from(events);
    expect(collected).toEqual([
      {
        _tag: "telemetry",
        timestamp: 400,
        event: telemetryEvent,
      },
    ]);
  });

  it("creates event streams from telemetry service with optional runtime stream", async () => {
    const telemetryEvent: TelemetryEvent = {
      _tag: "action",
      phase: "success",
      name: "save",
      timestamp: 500,
    };

    const runtimeEvent: RuntimeEvent = {
      phase: "run-promise",
      timestamp: 501,
      detail: { id: 1 },
    };

    const telemetry = {
      emit: () => Effect.void,
      stream: Stream.fromIterable([telemetryEvent]),
    };

    const mixedSource = await Effect.runPromise(
      createDevtoolsEventStreamFromTelemetry({
        runtime: Stream.fromIterable([runtimeEvent]),
      }).pipe(Effect.provideService(Telemetry, telemetry)),
    );
    const telemetryOnlySource = await Effect.runPromise(
      createDevtoolsEventStreamFromTelemetry().pipe(Effect.provideService(Telemetry, telemetry)),
    );

    const mixed = Array.from(await Effect.runPromise(Stream.runCollect(mixedSource.stream)));
    const telemetryOnly = Array.from(
      await Effect.runPromise(Stream.runCollect(telemetryOnlySource.stream)),
    );

    expect(mixed.some((event) => event._tag === "runtime")).toBe(true);
    expect(mixed.some((event) => event._tag === "telemetry")).toBe(true);
    expect(telemetryOnly).toEqual([
      {
        _tag: "telemetry",
        timestamp: telemetryEvent.timestamp,
        event: telemetryEvent,
      },
    ]);
  });
});
