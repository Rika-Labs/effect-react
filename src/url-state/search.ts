import type { RouteSearchAdapter } from "../router/types";
import type { InferUrlCodec, UrlCodec } from "./codec";

export type UrlStateSchema = Record<string, UrlCodec<unknown>>;

export type InferUrlState<TSchema extends UrlStateSchema> = {
  readonly [K in keyof TSchema]?: InferUrlCodec<TSchema[K]>;
};

const toSearchParams = (input: string | URLSearchParams): URLSearchParams => {
  if (typeof input === "string") {
    const normalized = input.startsWith("?") ? input.slice(1) : input;
    return new URLSearchParams(normalized);
  }
  return new URLSearchParams(input);
};

export const defineSearchSchema = <TSchema extends UrlStateSchema>(schema: TSchema): TSchema =>
  schema;

export const parseSearch = <TSchema extends UrlStateSchema>(
  input: string | URLSearchParams,
  schema: TSchema,
): InferUrlState<TSchema> => {
  const searchParams = toSearchParams(input);
  const parsed: Partial<InferUrlState<TSchema>> = {};

  for (const [key, codec] of Object.entries(schema) as [keyof TSchema, TSchema[keyof TSchema]][]) {
    const values = searchParams.getAll(String(key));
    const decoded = codec.parse(values);
    if (decoded !== undefined) {
      parsed[key] = decoded as InferUrlState<TSchema>[typeof key];
    }
  }

  return parsed as InferUrlState<TSchema>;
};

export const serializeSearch = <TSchema extends UrlStateSchema>(
  value: InferUrlState<TSchema>,
  schema: TSchema,
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, codec] of Object.entries(schema) as [keyof TSchema, TSchema[keyof TSchema]][]) {
    const entry = value[key];
    if (entry === undefined) {
      continue;
    }

    const encoded = codec.serialize(entry as InferUrlCodec<TSchema[typeof key]>);
    for (const item of encoded) {
      searchParams.append(String(key), item);
    }
  }

  const searchText = searchParams.toString();
  return searchText.length > 0 ? `?${searchText}` : "";
};

export const createSearchAdapter = <TSchema extends UrlStateSchema>(
  schema: TSchema,
): RouteSearchAdapter<InferUrlState<TSchema>> => ({
  parse: (search) => parseSearch(search, schema),
  serialize: (value) => {
    const serialized = serializeSearch(value, schema);
    return new URLSearchParams(serialized.startsWith("?") ? serialized.slice(1) : serialized);
  },
});
