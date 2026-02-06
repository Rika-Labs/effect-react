import { useCallback, useMemo, useRef } from "react";
import { getNestedValue } from "../internal/pathUtils";

export interface FieldArrayItem {
  readonly _id: string;
}

export interface UseFieldArrayOptions<T extends Record<string, unknown>> {
  readonly name: string;
  readonly values: T;
  readonly setFieldValue: (field: string, value: unknown) => void;
}

export interface UseFieldArrayResult<Item> {
  readonly fields: readonly (Item & FieldArrayItem)[];
  readonly append: (item: Item) => void;
  readonly prepend: (item: Item) => void;
  readonly remove: (index: number) => void;
  readonly move: (from: number, to: number) => void;
  readonly swap: (indexA: number, indexB: number) => void;
  readonly replace: (index: number, item: Item) => void;
}

export const useFieldArray = <
  T extends Record<string, unknown>,
  Item extends Record<string, unknown> = Record<string, unknown>,
>(
  options: UseFieldArrayOptions<T>,
): UseFieldArrayResult<Item> => {
  const { name, values, setFieldValue } = options;
  const counterRef = useRef(0);
  const idMapRef = useRef(new WeakMap<object, string>());

  const rawItemsRef = useRef<Item[]>([]);

  const fields = useMemo(() => {
    const items = (getNestedValue(values, name) as Item[] | undefined) ?? [];
    rawItemsRef.current = items;
    return items.map((item) => {
      let id = idMapRef.current.get(item as object);
      if (id === undefined || id === "") {
        id = `field_${counterRef.current++}`;
        idMapRef.current.set(item as object, id);
      }
      return { ...item, _id: id } as Item & FieldArrayItem;
    });
  }, [values, name]);

  const write = useCallback(
    (nextItems: Item[]) => {
      setFieldValue(name, nextItems);
    },
    [name, setFieldValue],
  );

  const append = useCallback(
    (item: Item) => {
      write([...rawItemsRef.current, item]);
    },
    [write],
  );

  const prepend = useCallback(
    (item: Item) => {
      write([item, ...rawItemsRef.current]);
    },
    [write],
  );

  const remove = useCallback(
    (index: number) => {
      const next = [...rawItemsRef.current];
      next.splice(index, 1);
      write(next);
    },
    [write],
  );

  const move = useCallback(
    (from: number, to: number) => {
      const next = [...rawItemsRef.current];
      const [item] = next.splice(from, 1);
      if (item === undefined) return;
      next.splice(to, 0, item);
      write(next);
    },
    [write],
  );

  const swap = useCallback(
    (indexA: number, indexB: number) => {
      const itemA = rawItemsRef.current[indexA];
      const itemB = rawItemsRef.current[indexB];
      if (itemA === undefined || itemB === undefined) return;
      const next = [...rawItemsRef.current];
      next[indexA] = itemB as Item;
      next[indexB] = itemA as Item;
      write(next);
    },
    [write],
  );

  const replace = useCallback(
    (index: number, item: Item) => {
      const next = [...rawItemsRef.current];
      next[index] = item;
      write(next);
    },
    [write],
  );

  return { fields, append, prepend, remove, move, swap, replace };
};
