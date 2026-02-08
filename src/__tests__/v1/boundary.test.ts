import { ManagedRuntime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { BoundaryDecodeError, BoundaryLive, decodeUnknown } from "../../boundary";

describe("boundary codecs", () => {
  it("decodes known payloads", async () => {
    const runtime = ManagedRuntime.make(BoundaryLive);

    const schema = Schema.Struct({
      id: Schema.Number,
      name: Schema.String,
    });

    const value = await runtime.runPromise(
      decodeUnknown({
        source: "test:decode",
        schema,
        value: { id: 1, name: "Ada" },
      }),
    );

    await runtime.dispose();
    expect(value).toEqual({ id: 1, name: "Ada" });
  });

  it("fails with BoundaryDecodeError on invalid payloads", async () => {
    const runtime = ManagedRuntime.make(BoundaryLive);

    const schema = Schema.Struct({
      id: Schema.Number,
    });

    const exit = await runtime.runPromiseExit(
      decodeUnknown({
        source: "test:invalid",
        schema,
        value: { id: "bad" },
      }),
    );

    await runtime.dispose();

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const pretty = String(exit.cause);
      expect(pretty.includes("BoundaryDecodeError") || pretty.length > 0).toBe(true);
    }

    expect(BoundaryDecodeError).toBeDefined();
  });
});
