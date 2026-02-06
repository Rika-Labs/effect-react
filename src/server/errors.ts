export interface ValidationError {
  readonly _tag: "ValidationError";
  readonly field: string;
  readonly message: string;
}

export interface UnauthorizedError {
  readonly _tag: "UnauthorizedError";
  readonly message: string;
}

export interface ForbiddenError {
  readonly _tag: "ForbiddenError";
  readonly message: string;
}

export type ServerBoundaryError = ValidationError | UnauthorizedError | ForbiddenError;

export const validationError = (field: string, message: string): ValidationError => ({
  _tag: "ValidationError",
  field,
  message,
});

export const unauthorizedError = (message: string): UnauthorizedError => ({
  _tag: "UnauthorizedError",
  message,
});

export const forbiddenError = (message: string): ForbiddenError => ({
  _tag: "ForbiddenError",
  message,
});

export interface ErrorTransportCodec<E = unknown> {
  readonly encode: (error: unknown) => unknown;
  readonly decode: (wire: unknown) => E;
}

export const createErrorCodec = <E>(codec: ErrorTransportCodec<E>): ErrorTransportCodec<E> => codec;

export const identityErrorCodec: ErrorTransportCodec<unknown> = {
  encode: (error) => error,
  decode: (wire) => wire,
};
