import { useRef } from "react";

export interface UseDerivedOptions<S> {
  readonly equals?: (left: S, right: S) => boolean;
}

const defaultEquals = <S>(left: S, right: S): boolean => Object.is(left, right);

export const useDerived = <A, S>(
  value: A,
  select: (value: A) => S,
  options: UseDerivedOptions<S> = {},
): S => {
  const { equals = defaultEquals<S> } = options;
  const selected = select(value);
  const selectedRef = useRef(selected);
  if (!equals(selectedRef.current, selected)) {
    selectedRef.current = selected;
  }
  return selectedRef.current;
};
