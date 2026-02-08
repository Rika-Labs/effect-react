export interface VirtualSizeInput {
  readonly count: number;
  readonly estimateSize: number;
  readonly sizes?: readonly number[];
}

export interface VirtualOffsetInput extends VirtualSizeInput {
  readonly index: number;
}

export interface VirtualRangeInput extends VirtualSizeInput {
  readonly scrollOffset: number;
  readonly viewportSize: number;
  readonly overscan?: number;
}

export interface VirtualRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly overscanStartIndex: number;
  readonly overscanEndIndex: number;
}

export interface VirtualItemMeasurement {
  readonly index: number;
  readonly size: number;
  readonly start: number;
  readonly end: number;
}
