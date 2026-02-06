export const getNestedValue = (obj: unknown, path: string): unknown => {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

export const setNestedValue = <T>(obj: T, path: string, value: unknown): T => {
  const keys = path.split(".");
  const head: string = keys[0]!;
  if (keys.length === 1) {
    return { ...obj, [head]: value } as T;
  }
  const rest = keys.slice(1);
  const child = (obj as Record<string, unknown>)[head] ?? {};
  return { ...obj, [head]: setNestedValue(child, rest.join("."), value) } as T;
};
