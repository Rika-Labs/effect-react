import { describe, expect, it } from "vitest";
import {
  BoundaryDecodeError,
  BoundaryProtocolError,
  BoundaryTransportError,
} from "../../boundary/errors";

describe("boundary error classes", () => {
  it("constructs decode errors with context", () => {
    const error = new BoundaryDecodeError("boundary:decode", "invalid payload");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BoundaryDecodeError");
    expect(error._tag).toBe("BoundaryDecodeError");
    expect(error.source).toBe("boundary:decode");
    expect(error.messageText).toBe("invalid payload");
    expect(error.message).toBe("Boundary decode failed at boundary:decode: invalid payload");
  });

  it("constructs transport errors with cause values", () => {
    const cause = {
      status: 503,
      retryable: true,
    };
    const error = new BoundaryTransportError("boundary:transport", "request failed", cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BoundaryTransportError");
    expect(error._tag).toBe("BoundaryTransportError");
    expect(error.source).toBe("boundary:transport");
    expect(error.messageText).toBe("request failed");
    expect(error.causeValue).toEqual(cause);
    expect(error.message).toBe("Boundary transport failed at boundary:transport: request failed");
  });

  it("constructs protocol errors", () => {
    const error = new BoundaryProtocolError("boundary:protocol", "unexpected frame");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BoundaryProtocolError");
    expect(error._tag).toBe("BoundaryProtocolError");
    expect(error.source).toBe("boundary:protocol");
    expect(error.messageText).toBe("unexpected frame");
    expect(error.message).toBe("Boundary protocol violation at boundary:protocol: unexpected frame");
  });
});
