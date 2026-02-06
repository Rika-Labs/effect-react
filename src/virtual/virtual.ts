export interface VirtualItem {
  readonly key: string;
  readonly index: number;
  readonly start: number;
  readonly size: number;
  readonly end: number;
}

export interface VirtualRange {
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface VirtualListState {
  readonly items: readonly VirtualItem[];
  readonly totalSize: number;
  readonly range: VirtualRange;
}

export interface CreateVirtualListOptions {
  readonly count: number;
  readonly estimateSize: (index: number) => number;
  readonly scrollOffset: number;
  readonly viewportSize: number;
  readonly overscan?: number;
  readonly measuredSizes?: Readonly<Record<number, number>>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const buildMeasurements = (
  count: number,
  estimateSize: (index: number) => number,
  measuredSizes: Readonly<Record<number, number>> | undefined,
): {
  readonly starts: readonly number[];
  readonly sizes: readonly number[];
  readonly totalSize: number;
} => {
  const starts = Array.from({ length: count }, () => 0);
  const sizes = Array.from({ length: count }, () => 0);

  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    starts[index] = offset;
    const measured = measuredSizes?.[index];
    const estimated = estimateSize(index);
    const size = measured ?? estimated;
    const normalized = Number.isFinite(size) ? Math.max(0, size) : 0;
    sizes[index] = normalized;
    offset += normalized;
  }

  return {
    starts,
    sizes,
    totalSize: offset,
  };
};

const findStartIndex = (
  starts: readonly number[],
  sizes: readonly number[],
  offset: number,
): number => {
  if (starts.length === 0) {
    return 0;
  }

  let low = 0;
  let high = starts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = low + ((high - low) >> 1);
    const midStart = starts[mid]!;
    const midEnd = midStart + sizes[mid]!;

    if (midEnd <= offset) {
      low = mid + 1;
      result = Math.min(starts.length - 1, mid + 1);
      continue;
    }

    result = mid;
    high = mid - 1;
  }

  return result;
};

const findEndIndex = (
  starts: readonly number[],
  sizes: readonly number[],
  startIndex: number,
  limit: number,
): number => {
  if (starts.length === 0) {
    return 0;
  }

  let index = startIndex;
  while (index < starts.length) {
    const start = starts[index]!;
    const end = start + sizes[index]!;
    if (end >= limit) {
      return index;
    }
    index += 1;
  }

  return starts.length - 1;
};

export const createVirtualList = (options: CreateVirtualListOptions): VirtualListState => {
  const count = Math.max(0, options.count);
  if (count === 0) {
    return {
      items: [],
      totalSize: 0,
      range: {
        startIndex: 0,
        endIndex: 0,
      },
    };
  }

  const overscan = Math.max(0, options.overscan ?? 1);
  const { starts, sizes, totalSize } = buildMeasurements(
    count,
    options.estimateSize,
    options.measuredSizes,
  );

  const scrollOffset = clamp(options.scrollOffset, 0, Math.max(0, totalSize));
  const viewportSize = Math.max(0, options.viewportSize);

  const visibleStartIndex = findStartIndex(starts, sizes, scrollOffset);
  const visibleEndIndex = findEndIndex(
    starts,
    sizes,
    visibleStartIndex,
    scrollOffset + viewportSize,
  );

  const startIndex = clamp(visibleStartIndex - overscan, 0, count - 1);
  const endIndex = clamp(visibleEndIndex + overscan, 0, count - 1);

  const items: VirtualItem[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const start = starts[index]!;
    const size = sizes[index]!;
    items.push({
      key: String(index),
      index,
      start,
      size,
      end: start + size,
    });
  }

  return {
    items,
    totalSize,
    range: {
      startIndex,
      endIndex,
    },
  };
};

export interface VirtualGridState {
  readonly rows: VirtualListState;
  readonly columns: VirtualListState;
}

export interface CreateVirtualGridOptions {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly estimateRowSize: (rowIndex: number) => number;
  readonly estimateColumnSize: (columnIndex: number) => number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly overscan?: number;
  readonly measuredRowSizes?: Readonly<Record<number, number>>;
  readonly measuredColumnSizes?: Readonly<Record<number, number>>;
}

export const createVirtualGrid = (options: CreateVirtualGridOptions): VirtualGridState => ({
  rows: createVirtualList({
    count: options.rowCount,
    estimateSize: options.estimateRowSize,
    scrollOffset: options.scrollTop,
    viewportSize: options.viewportHeight,
    ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    ...(options.measuredRowSizes !== undefined ? { measuredSizes: options.measuredRowSizes } : {}),
  }),
  columns: createVirtualList({
    count: options.columnCount,
    estimateSize: options.estimateColumnSize,
    scrollOffset: options.scrollLeft,
    viewportSize: options.viewportWidth,
    ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    ...(options.measuredColumnSizes !== undefined
      ? { measuredSizes: options.measuredColumnSizes }
      : {}),
  }),
});
