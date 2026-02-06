import { Effect } from "effect";
import type { ServerActionWireResult } from "./actions";

export interface JsonDecodeSuccess<T> {
  readonly _tag: "success";
  readonly value: T;
}

export interface JsonDecodeFailure {
  readonly _tag: "failure";
  readonly message: string;
}

export type JsonDecodeResult<T> = JsonDecodeSuccess<T> | JsonDecodeFailure;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
};

export const normalizeActionBasePath = (path: string): string => {
  if (path.length === 0) {
    return "/__effect/actions";
  }
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

export const parseActionNameFromPath = (url: URL, basePath: string): string | undefined => {
  if (!url.pathname.startsWith(basePath)) {
    return undefined;
  }
  const raw = url.pathname.slice(basePath.length);
  if (raw.length <= 1) {
    return undefined;
  }
  return decodeURIComponent(raw.startsWith("/") ? raw.slice(1) : raw);
};

export const decodeJsonBodyEffect = (
  request: Request,
): Effect.Effect<JsonDecodeResult<unknown>, never, never> =>
  Effect.match(
    Effect.tryPromise<unknown, undefined>({
      try: () => request.json() as Promise<unknown>,
      catch: () => undefined,
    }),
    {
      onFailure: () => ({
        _tag: "failure" as const,
        message: "Invalid JSON body",
      }),
      onSuccess: (value) => ({
        _tag: "success" as const,
        value,
      }),
    },
  );

export const decodeJsonBody = (request: Request): Promise<JsonDecodeResult<unknown>> =>
  Effect.runPromise(decodeJsonBodyEffect(request));

export interface ActionRequestPayload {
  readonly input?: unknown;
}

export const decodeActionRequestPayload = (
  value: unknown,
): JsonDecodeResult<ActionRequestPayload> => {
  const record = asRecord(value);
  if (record === undefined) {
    return {
      _tag: "failure",
      message: "Action payload must be an object",
    };
  }

  const input = Object.prototype.hasOwnProperty.call(record, "input")
    ? { input: record["input"] }
    : {};

  return {
    _tag: "success",
    value: input,
  };
};

export const decodeServerActionWireResult = <Output, E>(
  value: unknown,
): JsonDecodeResult<ServerActionWireResult<Output, E>> => {
  const record = asRecord(value);
  if (record === undefined) {
    return {
      _tag: "failure",
      message: "Server action response was not an object",
    };
  }

  const tag = record["_tag"];
  if (tag !== "success" && tag !== "failure" && tag !== "defect" && tag !== "validation") {
    return {
      _tag: "failure",
      message: "Server action response was not a valid wire result",
    };
  }

  return {
    _tag: "success",
    value: record as ServerActionWireResult<Output, E>,
  };
};
