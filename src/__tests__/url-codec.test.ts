import { describe, expect, it } from "vitest";
import {
  arrayCodec,
  booleanCodec,
  dateCodec,
  enumCodec,
  jsonCodec,
  numberCodec,
  stringCodec,
} from "../url-state";

describe("url codecs", () => {
  it("parses and serializes primitives", () => {
    expect(stringCodec.parse(["abc"])).toBe("abc");
    expect(stringCodec.serialize("abc")).toEqual(["abc"]);

    expect(numberCodec.parse(["12"])).toBe(12);
    expect(numberCodec.parse(["bad"])).toBeUndefined();
    expect(numberCodec.serialize(7)).toEqual(["7"]);

    expect(booleanCodec.parse(["true"])).toBe(true);
    expect(booleanCodec.parse(["0"])).toBe(false);
    expect(booleanCodec.parse(["bad"])).toBeUndefined();
    expect(booleanCodec.serialize(true)).toEqual(["1"]);
  });

  it("supports enum, json, and date codecs", () => {
    const mode = enumCodec(["a", "b", "c"] as const);
    expect(mode.parse(["b"])).toBe("b");
    expect(mode.parse(["z"])).toBeUndefined();

    const json = jsonCodec<{ readonly id: number }>();
    expect(json.parse([JSON.stringify({ id: 1 })])).toEqual({ id: 1 });
    expect(json.parse(["{"])).toBeUndefined();

    const date = new Date("2024-01-01T00:00:00.000Z");
    expect(dateCodec.parse([date.toISOString()])?.toISOString()).toBe(date.toISOString());
    expect(dateCodec.parse(["not-a-date"])).toBeUndefined();
  });

  it("supports array codec composition", () => {
    const numbers = arrayCodec(numberCodec);
    expect(numbers.parse(["1", "2", "bad", "3"])).toEqual([1, 2, 3]);
    expect(numbers.serialize([4, 5])).toEqual(["4", "5"]);
  });
});
