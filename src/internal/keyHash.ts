export type KeyHasher = (key: readonly unknown[]) => string;

const unsupported = (kind: string): never => {
  throw new Error(`Unsupported query key value: ${kind}`);
};

const cycleError = (): never => {
  throw new Error("Query key contains a cyclical structure");
};

const serialize = (value: unknown, seen: WeakSet<object>): string => {
  switch (typeof value) {
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "number":
      if (Number.isNaN(value)) {
        return "number:NaN";
      }
      if (value === 0 && 1 / value === -Infinity) {
        return "number:-0";
      }
      if (!Number.isFinite(value)) {
        return value > 0 ? "number:Infinity" : "number:-Infinity";
      }
      return `number:${value}`;
    case "boolean":
      return value ? "boolean:true" : "boolean:false";
    case "undefined":
      return "undefined";
    case "bigint":
      return `bigint:${value.toString()}`;
    case "function":
      return unsupported("function");
    case "symbol":
      return unsupported("symbol");
    case "object":
      if (value === null) {
        return "null";
      }
      if (value instanceof Date) {
        const time = value.getTime();
        if (Number.isNaN(time)) {
          throw new Error("Invalid Date in query key");
        }
        return `date:${value.toISOString()}`;
      }
      if (Array.isArray(value)) {
        if (seen.has(value)) {
          return cycleError();
        }
        seen.add(value);
        const parts = value.map((item) => serialize(item, seen));
        seen.delete(value);
        return `array:[${parts.join(",")}]`;
      }
      const objectValue = value as Record<string, unknown>;
      const prototype: object | null = Reflect.getPrototypeOf(objectValue);
      if (prototype !== Object.prototype && prototype !== null) {
        return unsupported("object");
      }
      if (seen.has(objectValue)) {
        return cycleError();
      }
      seen.add(objectValue);
      const keys = Object.keys(objectValue).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${serialize(objectValue[key], seen)}`);
      }
      seen.delete(objectValue);
      return `object:{${parts.join(",")}}`;
    default:
      return unsupported(typeof value);
  }
};

export const hashQueryKey: KeyHasher = (key) => serialize(key, new WeakSet<object>());
