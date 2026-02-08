import type { ParseResult } from "effect";

export class BoundaryDecodeError extends Error {
  readonly _tag = "BoundaryDecodeError" as const;

  constructor(
    readonly source: string,
    readonly messageText: string,
    readonly causeValue?: ParseResult.ParseError,
  ) {
    super(`Boundary decode failed at ${source}: ${messageText}`);
    this.name = "BoundaryDecodeError";
  }
}

export class BoundaryTransportError extends Error {
  readonly _tag = "BoundaryTransportError" as const;

  constructor(
    readonly source: string,
    readonly messageText: string,
    readonly causeValue?: unknown,
  ) {
    super(`Boundary transport failed at ${source}: ${messageText}`);
    this.name = "BoundaryTransportError";
  }
}

export class BoundaryProtocolError extends Error {
  readonly _tag = "BoundaryProtocolError" as const;

  constructor(
    readonly source: string,
    readonly messageText: string,
  ) {
    super(`Boundary protocol violation at ${source}: ${messageText}`);
    this.name = "BoundaryProtocolError";
  }
}

export type BoundaryError = BoundaryDecodeError | BoundaryTransportError | BoundaryProtocolError;
