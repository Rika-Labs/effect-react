export interface UrlCodec<A> {
  parse(values: readonly string[]): A | undefined;
  serialize(value: A): readonly string[];
}

export type InferUrlCodec<TCodec extends UrlCodec<unknown>> =
  TCodec extends UrlCodec<infer Value> ? Value : never;

export const stringCodec: UrlCodec<string> = {
  parse: (values) => values[0],
  serialize: (value) => [value],
};

export const numberCodec: UrlCodec<number> = {
  parse: (values) => {
    const candidate = values[0];
    if (candidate === undefined) {
      return undefined;
    }
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
  serialize: (value) => [String(value)],
};

export const booleanCodec: UrlCodec<boolean> = {
  parse: (values) => {
    const candidate = values[0];
    if (candidate === undefined) {
      return undefined;
    }
    if (candidate === "1" || candidate === "true") {
      return true;
    }
    if (candidate === "0" || candidate === "false") {
      return false;
    }
    return undefined;
  },
  serialize: (value) => [value ? "1" : "0"],
};

export const enumCodec = <const TValues extends readonly string[]>(
  values: TValues,
): UrlCodec<TValues[number]> => {
  const allowed = new Set(values);
  return {
    parse: (input) => {
      const candidate = input[0];
      if (candidate === undefined) {
        return undefined;
      }
      return allowed.has(candidate) ? (candidate as TValues[number]) : undefined;
    },
    serialize: (value) => [value],
  };
};

export const jsonCodec = <T>(): UrlCodec<T> => ({
  parse: (values) => {
    const candidate = values[0];
    if (candidate === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(candidate) as T;
    } catch {
      return undefined;
    }
  },
  serialize: (value) => [JSON.stringify(value)],
});

export const dateCodec: UrlCodec<Date> = {
  parse: (values) => {
    const candidate = values[0];
    if (candidate === undefined) {
      return undefined;
    }
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  },
  serialize: (value) => [value.toISOString()],
};

export const arrayCodec = <A>(itemCodec: UrlCodec<A>): UrlCodec<readonly A[]> => ({
  parse: (values) => {
    const decoded: A[] = [];
    for (const value of values) {
      const parsed = itemCodec.parse([value]);
      if (parsed !== undefined) {
        decoded.push(parsed);
      }
    }
    return decoded;
  },
  serialize: (value) => {
    const encoded: string[] = [];
    for (const item of value) {
      encoded.push(...itemCodec.serialize(item));
    }
    return encoded;
  },
});
