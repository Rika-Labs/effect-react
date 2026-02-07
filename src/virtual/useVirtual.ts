import { useCallback, useMemo, useRef, useState } from "react";
import {
  createVirtualGrid,
  createVirtualList,
  type CreateVirtualGridOptions,
  type CreateVirtualListOptions,
  type VirtualGridState,
  type VirtualListState,
} from "./virtual";

interface MeasuredStore {
  readonly get: () => Readonly<Record<number, number>>;
  readonly set: (index: number, size: number) => void;
}

const useMeasuredStore = (): MeasuredStore => {
  const [version, setVersion] = useState(0);
  const measurementsRef = useRef<Record<number, number>>({});

  const get = useCallback(() => {
    void version;
    return measurementsRef.current;
  }, [version]);

  const set = useCallback((index: number, size: number) => {
    const normalized = Number.isFinite(size) ? Math.max(0, size) : 0;
    if (measurementsRef.current[index] === normalized) {
      return;
    }
    measurementsRef.current = {
      ...measurementsRef.current,
      [index]: normalized,
    };
    setVersion((prev) => prev + 1);
  }, []);

  return {
    get,
    set,
  };
};

export interface UseVirtualListOptions extends Omit<
  CreateVirtualListOptions,
  "measuredSizes" | "estimateSize"
> {
  readonly estimateSize?: (index: number) => number;
  readonly itemHeight?: number;
  readonly measuredSizes?: Readonly<Record<number, number>>;
}

export interface UseVirtualListResult {
  readonly state: VirtualListState;
  readonly measure: (index: number, size: number) => void;
}

export const useVirtualList = (options: UseVirtualListOptions): UseVirtualListResult => {
  const measuredStore = useMeasuredStore();
  const measuredSizes = options.measuredSizes ?? measuredStore.get();
  const resolvedEstimateSize = useMemo(
    () => options.estimateSize ?? (() => options.itemHeight ?? 0),
    [options.estimateSize, options.itemHeight],
  );

  const state = useMemo(
    () =>
      createVirtualList({
        ...options,
        estimateSize: resolvedEstimateSize,
        measuredSizes,
      }),
    [measuredSizes, options, resolvedEstimateSize],
  );

  return {
    state,
    measure: measuredStore.set,
  };
};

export interface UseVirtualGridOptions extends Omit<
  CreateVirtualGridOptions,
  "measuredRowSizes" | "measuredColumnSizes"
> {
  readonly measuredRowSizes?: Readonly<Record<number, number>>;
  readonly measuredColumnSizes?: Readonly<Record<number, number>>;
}

export interface UseVirtualGridResult {
  readonly state: VirtualGridState;
  readonly measureRow: (index: number, size: number) => void;
  readonly measureColumn: (index: number, size: number) => void;
}

export const useVirtualGrid = (options: UseVirtualGridOptions): UseVirtualGridResult => {
  const rowStore = useMeasuredStore();
  const columnStore = useMeasuredStore();

  const measuredRowSizes = options.measuredRowSizes ?? rowStore.get();
  const measuredColumnSizes = options.measuredColumnSizes ?? columnStore.get();

  const state = useMemo(
    () =>
      createVirtualGrid({
        ...options,
        measuredRowSizes,
        measuredColumnSizes,
      }),
    [measuredColumnSizes, measuredRowSizes, options],
  );

  return {
    state,
    measureRow: rowStore.set,
    measureColumn: columnStore.set,
  };
};
