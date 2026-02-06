import { describe, expect, it } from "vitest";
import { Duration } from "effect";
import { addDuration, isExpired, toDuration, toMillis } from "../internal/duration";

describe("duration helpers", () => {
  it("decodes to Duration", () => {
    const value = toDuration("2 seconds");
    expect(Duration.toMillis(value)).toBe(2000);
  });

  it("normalizes millis", () => {
    expect(toMillis(25)).toBe(25);
    expect(toMillis("1 second")).toBe(1000);
  });

  it("adds duration to a start value", () => {
    expect(addDuration(10, "15 millis")).toBe(25);
  });

  it("checks expiration", () => {
    expect(isExpired(100, 100)).toBe(true);
    expect(isExpired(101, 100)).toBe(false);
  });
});
