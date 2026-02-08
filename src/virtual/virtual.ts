import { Array as EffectArray, pipe } from "effect";
import type {
  VirtualItemMeasurement,
  VirtualOffsetInput,
  VirtualRange,
  VirtualRangeInput,
  VirtualSizeInput,
} from "./types";

const normalizeNonNegativeInteger = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const normalizeNonNegativeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
};

const normalizePositiveNumber = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
};

const normalizeCount = (count: number): number => normalizeNonNegativeInteger(count);
const normalizeEstimateSize = (estimateSize: number): number => normalizePositiveNumber(estimateSize, 1);

const resolveItemSize = (
  sizes: readonly number[] | undefined,
  index: number,
  estimateSize: number,
): number => normalizePositiveNumber(sizes?.[index] ?? estimateSize, estimateSize);

export const measureVirtualItems = (input: VirtualSizeInput): readonly VirtualItemMeasurement[] => {
  const count = normalizeCount(input.count);
  const estimateSize = normalizeEstimateSize(input.estimateSize);
  const items: VirtualItemMeasurement[] = [];

  let offset = 0;

  for (let index = 0; index < count; index += 1) {
    const size = resolveItemSize(input.sizes, index, estimateSize);
    const start = offset;
    const end = start + size;

    items[index] = {
      index,
      size,
      start,
      end,
    };

    offset = end;
  }

  return items;
};

export const calculateOffsets = (input: VirtualSizeInput): readonly number[] =>
  pipe(
    measureVirtualItems(input),
    EffectArray.map((item) => item.start),
  );

export const calculateTotalSize = (input: VirtualSizeInput): number => {
  const items = measureVirtualItems(input);
  if (items.length === 0) {
    return 0;
  }
  return items[items.length - 1]!.end;
};

export const calculateOffsetForIndex = (input: VirtualOffsetInput): number => {
  const count = normalizeCount(input.count);
  const index = normalizeNonNegativeInteger(input.index);

  if (count === 0 || index === 0) {
    return 0;
  }

  if (index >= count) {
    return calculateTotalSize(input);
  }

  const estimateSize = normalizeEstimateSize(input.estimateSize);
  let offset = 0;

  for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
    offset += resolveItemSize(input.sizes, currentIndex, estimateSize);
  }

  return offset;
};

export const calculateVisibleRange = (input: VirtualRangeInput): VirtualRange => {
  const count = normalizeCount(input.count);

  if (count === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      overscanStartIndex: 0,
      overscanEndIndex: -1,
    };
  }

  const viewportSize = normalizeNonNegativeNumber(input.viewportSize);
  const scrollOffset = normalizeNonNegativeNumber(input.scrollOffset);
  const overscan = normalizeNonNegativeInteger(input.overscan ?? 0);
  const viewportEnd = scrollOffset + viewportSize;

  const measurements = measureVirtualItems(input);
  let startIndex = count - 1;
  let endIndex = count - 1;
  let foundStart = false;

  for (const item of measurements) {
    if (!foundStart && item.end > scrollOffset) {
      startIndex = item.index;
      foundStart = true;
    }

    if (item.start < viewportEnd) {
      endIndex = item.index;
    }

    if (foundStart && item.start >= viewportEnd) {
      break;
    }
  }

  if (!foundStart) {
    startIndex = count - 1;
    endIndex = count - 1;
  } else if (viewportSize <= 0) {
    endIndex = startIndex;
  }

  return {
    startIndex,
    endIndex,
    overscanStartIndex: Math.max(0, startIndex - overscan),
    overscanEndIndex: Math.min(count - 1, endIndex + overscan),
  };
};

export const getOffsetForIndex = calculateOffsetForIndex;
export const getTotalSize = calculateTotalSize;
export const getVisibleRange = calculateVisibleRange;
