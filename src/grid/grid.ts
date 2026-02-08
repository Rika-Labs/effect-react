import { Array as EffectArray, Order, pipe } from "effect";
import type {
  GridColumn,
  GridColumnId,
  GridFilter,
  GridPage,
  GridPagination,
  GridRowProjection,
  GridSort,
  GridSortDirection,
} from "./types";

type GridComparable = string | number | bigint | boolean | Date | null | undefined;

const normalizeInteger = (value: number, minimum: number): number => {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.max(minimum, Math.floor(value));
};

const toComparable = (value: unknown): GridComparable => {
  if (value === null || value === undefined || value instanceof Date) {
    return value;
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
      return value;
    case "symbol":
      return value.description ?? "symbol";
    case "function":
      return value.name.length > 0 ? `[function ${value.name}]` : "[function]";
    default:
      try {
        const encoded = JSON.stringify(value);
        return encoded ?? "";
      } catch {
        return "";
      }
  }
};

const compareComparable = (left: GridComparable, right: GridComparable): -1 | 0 | 1 => {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : -1;
  }

  if (right === null || right === undefined) {
    return 1;
  }

  if (left instanceof Date && right instanceof Date) {
    return Order.Date(left, right);
  }

  if (typeof left === "number" && typeof right === "number") {
    return Order.number(left, right);
  }

  if (typeof left === "bigint" && typeof right === "bigint") {
    return Order.bigint(left, right);
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Order.boolean(left, right);
  }

  return Order.string(toSearchText(left), toSearchText(right));
};

const comparableOrder: Order.Order<GridComparable> = Order.make(compareComparable);

const toSearchText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "bigint":
    case "boolean":
      return value.toString();
    case "symbol":
      return value.description ?? "symbol";
    case "function":
      return value.name.length > 0 ? value.name : "function";
    default:
      try {
        const encoded = JSON.stringify(value);
        return encoded ?? "";
      } catch {
        return "";
      }
  }
};

const defaultFilterMatch = (value: unknown, filterValue: unknown): boolean => {
  if (filterValue === null || filterValue === undefined) {
    return true;
  }

  if (typeof filterValue === "string") {
    const normalizedFilter = filterValue.trim().toLowerCase();
    if (normalizedFilter.length === 0) {
      return true;
    }
    return toSearchText(value).toLowerCase().includes(normalizedFilter);
  }

  if (Array.isArray(filterValue)) {
    return filterValue.some((candidate) => Object.is(candidate, value));
  }

  if (filterValue instanceof Date && value instanceof Date) {
    return filterValue.getTime() === value.getTime();
  }

  return Object.is(value, filterValue);
};

const toSortDirection = (direction: GridSortDirection | undefined): GridSortDirection =>
  direction === "desc" ? "desc" : "asc";

export const defineColumns = <
  Row,
  const Columns extends readonly GridColumn<Row, string, unknown>[] = readonly GridColumn<
    Row,
    string,
    unknown
  >[],
>(
  columns: Columns,
): Columns => columns;

export const projectRow = <Row, const Columns extends readonly GridColumn<Row, string, unknown>[]>(
  row: Row,
  columns: Columns,
): GridRowProjection<Columns> => {
  const projection: Record<string, unknown> = {};

  for (const column of columns) {
    projection[column.id] = column.accessor(row);
  }

  return projection as GridRowProjection<Columns>;
};

export const projectRows = <Row, const Columns extends readonly GridColumn<Row, string, unknown>[]>(
  rows: readonly Row[],
  columns: Columns,
): readonly GridRowProjection<Columns>[] =>
  pipe(
    rows,
    EffectArray.fromIterable,
    EffectArray.map((row) => projectRow(row, columns)),
  );

export const mapRows = projectRows;

export const sortRows = <Row, const Columns extends readonly GridColumn<Row, string, unknown>[]>(
  rows: readonly Row[],
  columns: Columns,
  sorts: readonly GridSort<GridColumnId<Columns>>[],
): readonly Row[] => {
  const input = EffectArray.fromIterable(rows);

  if (input.length < 2 || sorts.length === 0) {
    return input;
  }

  const columnLookup = new Map<GridColumnId<Columns>, Columns[number]>();
  for (const column of columns) {
    columnLookup.set(column.id as GridColumnId<Columns>, column);
  }

  const orders: Order.Order<Row>[] = [];

  for (const sort of sorts) {
    const column = columnLookup.get(sort.id);
    if (column === undefined) {
      continue;
    }

    const orderForColumn = Order.mapInput(comparableOrder, (row: Row) =>
      toComparable(column.accessor(row)),
    );

    orders.push(toSortDirection(sort.direction) === "desc" ? Order.reverse(orderForColumn) : orderForColumn);
  }

  if (orders.length === 0) {
    return input;
  }

  const combinedOrder = Order.combineAll(orders);

  type IndexedRow = {
    readonly row: Row;
    readonly index: number;
  };

  const indexedOrder = Order.combine(
    Order.mapInput(combinedOrder, (entry: IndexedRow) => entry.row),
    Order.mapInput(Order.number, (entry: IndexedRow) => entry.index),
  );

  return pipe(
    input,
    EffectArray.map((row, index): IndexedRow => ({ row, index })),
    EffectArray.sort(indexedOrder),
    EffectArray.map((entry) => entry.row),
  );
};

export const filterRows = <Row, const Columns extends readonly GridColumn<Row, string, unknown>[]>(
  rows: readonly Row[],
  columns: Columns,
  filters: readonly GridFilter<GridColumnId<Columns>>[],
): readonly Row[] => {
  const input = EffectArray.fromIterable(rows);

  if (filters.length === 0) {
    return input;
  }

  const columnLookup = new Map<GridColumnId<Columns>, Columns[number]>();
  for (const column of columns) {
    columnLookup.set(column.id as GridColumnId<Columns>, column);
  }

  return pipe(
    input,
    EffectArray.filter((row) =>
      filters.every((filter) => {
        const column = columnLookup.get(filter.id);
        if (column === undefined) {
          return true;
        }
        return defaultFilterMatch(column.accessor(row), filter.value);
      }),
    ),
  );
};

export const paginateRows = <Row>(
  rows: readonly Row[],
  pagination: GridPagination,
): GridPage<Row> => {
  const input = EffectArray.fromIterable(rows);
  const pageSize = normalizeInteger(pagination.pageSize, 1);
  const pageCount = input.length === 0 ? 0 : Math.ceil(input.length / pageSize);
  const requestedPageIndex = normalizeInteger(pagination.pageIndex, 0);
  const pageIndex = pageCount === 0 ? 0 : Math.min(requestedPageIndex, pageCount - 1);
  const pageOffset = pageIndex * pageSize;

  const pageRows = pipe(
    input,
    EffectArray.drop(pageOffset),
    EffectArray.take(pageSize),
  );

  return {
    rows: pageRows,
    pageIndex,
    pageSize,
    pageCount,
    totalRows: input.length,
  };
};
