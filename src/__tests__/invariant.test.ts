import { describe, expect, it } from "vitest";
import { invariant, unreachable } from "../internal/invariant";

describe("invariant", () => {
  it("does not throw when condition is truthy", () => {
    expect(() => invariant(true, "x")).not.toThrow();
  });

  it("throws when condition is falsy", () => {
    expect(() => invariant(false, "bad")).toThrow("bad");
  });

  it("throws for unreachable", () => {
    expect(() => unreachable("x" as never)).toThrow("Unreachable");
  });
});
