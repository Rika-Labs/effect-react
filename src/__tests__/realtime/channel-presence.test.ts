import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { createChannel, createPresence, publish, subscribe } from "../../realtime";

describe("realtime module", () => {
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
});
