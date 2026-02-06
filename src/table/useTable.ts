import { useCallback, useMemo, useState } from "react";
import {
  createTableModel,
  createTableState,
  toggleRowSelection,
  type TableColumn,
  type TableModel,
  type TableSortState,
  type TableState,
} from "./table";

export interface UseTableOptions<Row> {
  readonly data: readonly Row[];
  readonly columns: readonly TableColumn<Row, unknown>[];
  readonly state?: TableState;
  readonly onStateChange?: (next: TableState) => void;
  readonly getRowId?: (row: Row, index: number) => string;
}

export interface UseTableResult<Row> {
  readonly model: TableModel<Row>;
  readonly state: TableState;
  readonly setState: (updater: TableState | ((previous: TableState) => TableState)) => void;
  readonly setSort: (sort: TableSortState | undefined) => void;
  readonly setGlobalFilter: (query: string | undefined) => void;
  readonly setPageIndex: (pageIndex: number) => void;
  readonly setPageSize: (pageSize: number) => void;
  readonly toggleRowSelection: (rowId: string) => void;
}

const resolveStateUpdate = (
  previous: TableState,
  updater: TableState | ((previous: TableState) => TableState),
): TableState => (typeof updater === "function" ? updater(previous) : updater);

export const useTable = <Row>(options: UseTableOptions<Row>): UseTableResult<Row> => {
  const [internalState, setInternalState] = useState<TableState>(() =>
    createTableState(options.state),
  );

  const state = options.state ?? internalState;

  const applyState = useCallback(
    (updater: TableState | ((previous: TableState) => TableState)) => {
      const next = resolveStateUpdate(state, updater);
      if (options.state === undefined) {
        setInternalState(next);
      }
      options.onStateChange?.(next);
    },
    [options, state],
  );

  const model = useMemo(
    () =>
      createTableModel({
        data: options.data,
        columns: options.columns,
        state,
        ...(options.getRowId !== undefined ? { getRowId: options.getRowId } : {}),
      }),
    [options.columns, options.data, options.getRowId, state],
  );

  const setSort = useCallback(
    (sort: TableSortState | undefined) => {
      applyState((previous) => ({
        ...previous,
        sort,
      }));
    },
    [applyState],
  );

  const setGlobalFilter = useCallback(
    (query: string | undefined) => {
      applyState((previous) => ({
        ...previous,
        globalFilter: query,
        pageIndex: 0,
      }));
    },
    [applyState],
  );

  const setPageIndex = useCallback(
    (pageIndex: number) => {
      applyState((previous) => ({
        ...previous,
        pageIndex: Math.max(0, pageIndex),
      }));
    },
    [applyState],
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      applyState((previous) => ({
        ...previous,
        pageSize: Math.max(1, pageSize),
        pageIndex: 0,
      }));
    },
    [applyState],
  );

  const toggleSelection = useCallback(
    (rowId: string) => {
      applyState((previous) => toggleRowSelection(previous, rowId));
    },
    [applyState],
  );

  return {
    model,
    state,
    setState: applyState,
    setSort,
    setGlobalFilter,
    setPageIndex,
    setPageSize,
    toggleRowSelection: toggleSelection,
  };
};
