export interface TableColumn<Row, Value = unknown> {
  readonly id: string;
  readonly header?: string;
  readonly accessor: (row: Row) => Value;
  readonly sort?: (left: Value, right: Value, leftRow: Row, rightRow: Row) => number;
  readonly filter?: (value: Value, query: string, row: Row) => boolean;
}

export interface TableSortState {
  readonly columnId: string;
  readonly desc?: boolean;
}

export interface TableState {
  readonly sort: TableSortState | undefined;
  readonly globalFilter: string | undefined;
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly rowSelection: Readonly<Record<string, boolean>>;
}

export interface TableRow<Row> {
  readonly id: string;
  readonly index: number;
  readonly original: Row;
}

export interface TableModel<Row> {
  readonly rows: readonly TableRow<Row>[];
  readonly pageRows: readonly TableRow<Row>[];
  readonly pageCount: number;
  readonly state: TableState;
}

export interface CreateTableModelOptions<Row> {
  readonly data: readonly Row[];
  readonly columns: readonly TableColumn<Row, unknown>[];
  readonly state: TableState;
  readonly getRowId?: (row: Row, index: number) => string;
}

const defaultGetRowId = <Row>(_row: Row, index: number): string => String(index);

const includesCaseInsensitive = (left: string, right: string): boolean =>
  left.toLowerCase().includes(right.toLowerCase());

const applyFilter = <Row>(
  rows: readonly TableRow<Row>[],
  columns: readonly TableColumn<Row, unknown>[],
  query: string,
): readonly TableRow<Row>[] => {
  if (query.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    for (const column of columns) {
      const value = column.accessor(row.original);
      if (column.filter) {
        if (column.filter(value, query, row.original)) {
          return true;
        }
        continue;
      }
      if (includesCaseInsensitive(String(value), query)) {
        return true;
      }
    }
    return false;
  });
};

const applySort = <Row>(
  rows: readonly TableRow<Row>[],
  columns: readonly TableColumn<Row, unknown>[],
  sort: TableSortState | undefined,
): readonly TableRow<Row>[] => {
  if (sort === undefined) {
    return rows;
  }

  const column = columns.find((candidate) => candidate.id === sort.columnId);
  if (column === undefined) {
    return rows;
  }

  const sorted = [...rows].sort((left, right) => {
    const leftValue = column.accessor(left.original);
    const rightValue = column.accessor(right.original);
    if (column.sort) {
      return column.sort(leftValue, rightValue, left.original, right.original);
    }

    if (leftValue === rightValue) {
      return 0;
    }

    return String(leftValue).localeCompare(String(rightValue));
  });

  if (sort.desc === true) {
    sorted.reverse();
  }

  return sorted;
};

const applyPagination = <Row>(
  rows: readonly TableRow<Row>[],
  state: TableState,
): {
  readonly pageRows: readonly TableRow<Row>[];
  readonly pageCount: number;
} => {
  const pageSize = Math.max(1, state.pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.max(0, Math.min(state.pageIndex, pageCount - 1));
  const offset = pageIndex * pageSize;

  return {
    pageRows: rows.slice(offset, offset + pageSize),
    pageCount,
  };
};

export const createTableState = (partial?: Partial<TableState>): TableState => ({
  sort: partial?.sort,
  globalFilter: partial?.globalFilter,
  pageIndex: partial?.pageIndex ?? 0,
  pageSize: partial?.pageSize ?? 20,
  rowSelection: partial?.rowSelection ?? {},
});

export const createTableModel = <Row>(options: CreateTableModelOptions<Row>): TableModel<Row> => {
  const getRowId = options.getRowId ?? defaultGetRowId<Row>;
  const baseRows = options.data.map((row, index) => ({
    id: getRowId(row, index),
    index,
    original: row,
  }));

  const filtered = applyFilter(baseRows, options.columns, options.state.globalFilter ?? "");
  const sorted = applySort(filtered, options.columns, options.state.sort);
  const { pageRows, pageCount } = applyPagination(sorted, options.state);

  return {
    rows: sorted,
    pageRows,
    pageCount,
    state: options.state,
  };
};

export const toggleRowSelection = (state: TableState, rowId: string): TableState => {
  const rowSelection = { ...state.rowSelection };
  if (rowSelection[rowId] === true) {
    delete rowSelection[rowId];
  } else {
    rowSelection[rowId] = true;
  }

  return {
    ...state,
    rowSelection,
  };
};
