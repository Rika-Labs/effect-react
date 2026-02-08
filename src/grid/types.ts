export interface GridColumn<Row, Id extends string = string, Value = unknown> {
  readonly id: Id;
  readonly header?: string;
  readonly accessor: (row: Row) => Value;
}

type ColumnIdOf<Column> = Column extends GridColumn<infer _Row, infer Id, infer _Value> ? Id : never;
type ColumnValueOf<Column> = Column extends GridColumn<infer _Row, infer _Id, infer Value> ? Value : never;

export type GridColumnId<Columns extends readonly unknown[]> = ColumnIdOf<Columns[number]>;

export type GridColumnValue<
  Columns extends readonly unknown[],
  Id extends GridColumnId<Columns>,
> = ColumnValueOf<Extract<Columns[number], { readonly id: Id }>>;

export type GridRowProjection<Columns extends readonly unknown[]> = {
  readonly [Column in Columns[number] as ColumnIdOf<Column>]: ColumnValueOf<Column>;
};

export type GridSortDirection = "asc" | "desc";

export interface GridSort<ColumnId extends string> {
  readonly id: ColumnId;
  readonly direction?: GridSortDirection;
}

export interface GridFilter<ColumnId extends string> {
  readonly id: ColumnId;
  readonly value: unknown;
}

export interface GridPagination {
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface GridPage<Row> {
  readonly rows: readonly Row[];
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly totalRows: number;
}
