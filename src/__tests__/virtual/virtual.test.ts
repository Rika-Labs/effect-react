import { describe, expect, it } from "vitest";
import {
  calculateOffsetForIndex,
  calculateOffsets,
  calculateTotalSize,
  calculateVisibleRange,
  measureVirtualItems,
} from "../../virtual";

describe("virtual module", () => {
  it("calculates total size and offsets using measured and estimated sizes", () => {
    const input = {
      count: 5,
      estimateSize: 25,
      sizes: [20, 30, 40],
    } as const;

    expect(calculateTotalSize(input)).toBe(140);
    expect(calculateOffsets(input)).toEqual([0, 20, 50, 90, 115]);
    expect(
      calculateOffsetForIndex({
        ...input,
        index: 3,
      }),
    ).toBe(90);
  });

  it("calculates visible range with overscan", () => {
    const range = calculateVisibleRange({
      count: 5,
      estimateSize: 25,
      sizes: [20, 30, 40, 50, 60],
      scrollOffset: 35,
      viewportSize: 70,
      overscan: 1,
    });

    expect(range).toEqual({
      startIndex: 1,
      endIndex: 3,
      overscanStartIndex: 0,
      overscanEndIndex: 4,
    });
  });

  it("normalizes invalid inputs for measurements and offset calculations", () => {
    expect(
      measureVirtualItems({
        count: -5,
        estimateSize: 20,
      }),
    ).toEqual([]);

    const normalizedInput = {
      count: 3,
      estimateSize: 0,
      sizes: [5, -10, Number.POSITIVE_INFINITY],
    } as const;

    expect(measureVirtualItems(normalizedInput)).toEqual([
      { index: 0, size: 5, start: 0, end: 5 },
      { index: 1, size: 1, start: 5, end: 6 },
      { index: 2, size: 1, start: 6, end: 7 },
    ]);
    expect(calculateOffsets(normalizedInput)).toEqual([0, 5, 6]);
    expect(calculateTotalSize(normalizedInput)).toBe(7);
    expect(
      calculateOffsetForIndex({
        ...normalizedInput,
        index: -100,
      }),
    ).toBe(0);
    expect(
      calculateOffsetForIndex({
        ...normalizedInput,
        index: 100,
      }),
    ).toBe(7);
  });

  it("handles empty and degenerate viewport ranges", () => {
    expect(
      calculateVisibleRange({
        count: 0,
        estimateSize: 10,
        scrollOffset: 50,
        viewportSize: 100,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: -1,
      overscanStartIndex: 0,
      overscanEndIndex: -1,
    });

    const collapsedViewport = calculateVisibleRange({
      count: 4,
      estimateSize: 10,
      sizes: [10, 20, 30, 40],
      scrollOffset: 15,
      viewportSize: 0,
      overscan: 8,
    });

    expect(collapsedViewport).toEqual({
      startIndex: 1,
      endIndex: 1,
      overscanStartIndex: 0,
      overscanEndIndex: 3,
    });

    const beyondEnd = calculateVisibleRange({
      count: 4,
      estimateSize: 10,
      sizes: [10, 10, 10, 10],
      scrollOffset: 200,
      viewportSize: 60,
      overscan: 2,
    });

    expect(beyondEnd).toEqual({
      startIndex: 3,
      endIndex: 3,
      overscanStartIndex: 1,
      overscanEndIndex: 3,
    });
  });
});
