import { describe, expect, it } from "vitest";
import { hashQueryKey } from "../internal/keyHash";

describe("hashQueryKey", () => {
  it("normalizes object key order", () => {
    const a = hashQueryKey([{ b: 1, a: 2 }]);
    const b = hashQueryKey([{ a: 2, b: 1 }]);
    expect(a).toBe(b);
  });

  it("preserves array order sensitivity", () => {
    const a = hashQueryKey([1, 2, 3]);
    const b = hashQueryKey([3, 2, 1]);
    expect(a).not.toBe(b);
  });

  it("supports dates and bigint", () => {
    const a = hashQueryKey([new Date("2024-01-01T00:00:00.000Z"), 10n]);
    const b = hashQueryKey([new Date("2024-01-01T00:00:00.000Z"), 10n]);
    expect(a).toBe(b);
  });

  it("supports edge primitive values", () => {
    const a = hashQueryKey([-0, NaN, Infinity, -Infinity, true, false, undefined, null]);
    const b = hashQueryKey([-0, NaN, Infinity, -Infinity, true, false, undefined, null]);
    expect(a).toBe(b);
  });

  it("rejects unsupported values", () => {
    expect(() => hashQueryKey([Symbol("x")])).toThrow("Unsupported query key value: symbol");
    expect(() => hashQueryKey([() => 1])).toThrow("Unsupported query key value: function");
    expect(() => hashQueryKey([new Map([["k", "v"]])])).toThrow(
      "Unsupported query key value: object",
    );
  });

  it("rejects cyclical values", () => {
    const x: { self?: unknown } = {};
    x.self = x;
    expect(() => hashQueryKey([x])).toThrow("Query key contains a cyclical structure");
  });

  it("rejects invalid dates", () => {
    expect(() => hashQueryKey([new Date("not-a-date")])).toThrow("Invalid Date in query key");
  });
});
