import { describe, expect, it } from "vitest";
import { defineColumns, filterRows, paginateRows, projectRows, sortRows } from "../../grid";

interface User {
  readonly id: number;
  readonly name: string;
  readonly city: string;
  readonly score: number;
  readonly active: boolean;
}

const users: readonly User[] = [
  { id: 1, name: "Ada", city: "NY", score: 91, active: true },
  { id: 2, name: "Ben", city: "SF", score: 72, active: false },
  { id: 3, name: "Cara", city: "ny", score: 88, active: true },
  { id: 4, name: "Drew", city: "LA", score: 88, active: true },
  { id: 5, name: "Evan", city: "NYC", score: 99, active: true },
];

const columns = defineColumns<User>([
  { id: "id", accessor: (row) => row.id },
  { id: "name", accessor: (row) => row.name },
  { id: "city", accessor: (row) => row.city },
  { id: "score", accessor: (row) => row.score },
  { id: "active", accessor: (row) => row.active },
] as const);

const namedFn = (): string => "named";

const otherFn = (): string => "other";

describe("grid module", () => {
  it("filters, sorts, and projects rows from typed columns", () => {
    const filtered = filterRows(users, columns, [
      { id: "active", value: true },
      { id: "city", value: "ny" },
    ]);

    const sorted = sortRows(filtered, columns, [
      { id: "score", direction: "desc" },
      { id: "name", direction: "asc" },
    ]);

    const projected = projectRows(sorted, columns);

    expect(sorted.map((row) => row.id)).toEqual([5, 1, 3]);
    expect(projected[0]).toEqual({
      id: 5,
      name: "Evan",
      city: "NYC",
      score: 99,
      active: true,
    });
  });

  it("paginates sorted rows", () => {
    const sorted = sortRows(users, columns, [{ id: "score", direction: "desc" }]);
    const page = paginateRows(sorted, { pageIndex: 0, pageSize: 2 });

    expect(page.totalRows).toBe(5);
    expect(page.pageCount).toBe(3);
    expect(page.pageSize).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual([5, 1]);
  });

  it("handles filter edge cases and ignores unknown filter ids", () => {
    interface EventRow {
      readonly id: number;
      readonly label: string;
      readonly createdAt: Date;
      readonly metric: number;
    }

    const eventRows: readonly EventRow[] = [
      {
        id: 1,
        label: "Alpha",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        metric: Number.NaN,
      },
      {
        id: 2,
        label: "beta",
        createdAt: new Date("2024-02-01T00:00:00.000Z"),
        metric: 9,
      },
      {
        id: 3,
        label: "alphabet",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        metric: 12,
      },
    ];

    const eventColumns = defineColumns<EventRow>([
      { id: "label", accessor: (row) => row.label },
      { id: "createdAt", accessor: (row) => row.createdAt },
      { id: "metric", accessor: (row) => row.metric },
    ] as const);

    const filtered = filterRows(eventRows, eventColumns, [
      { id: "label", value: " alpha " },
      { id: "metric", value: [Number.NaN, 999] },
      { id: "createdAt", value: new Date("2024-01-01T00:00:00.000Z") },
      {
        id: "unknown",
        value: "ignored",
      } as never,
    ]);

    expect(filtered.map((row) => row.id)).toEqual([1]);
  });

  it("supports default sort direction, stable ties, and pagination normalization", () => {
    const ascByDefault = sortRows(users, columns, [{ id: "score" }]);
    expect(ascByDefault.map((row) => row.id)).toEqual([2, 3, 4, 1, 5]);

    const withUnknownSort = sortRows(users, columns, [
      { id: "score", direction: "desc" },
      {
        id: "unknown",
        direction: "asc",
      } as never,
    ]);
    expect(withUnknownSort.map((row) => row.id)).toEqual([5, 1, 3, 4, 2]);

    const clampedPage = paginateRows(users, {
      pageIndex: 99,
      pageSize: 0,
    });
    expect(clampedPage.pageSize).toBe(1);
    expect(clampedPage.pageIndex).toBe(4);
    expect(clampedPage.rows.map((row) => row.id)).toEqual([5]);

    const normalizedPage = paginateRows(users, {
      pageIndex: Number.POSITIVE_INFINITY,
      pageSize: Number.NaN,
    });
    expect(normalizedPage.pageSize).toBe(1);
    expect(normalizedPage.pageIndex).toBe(0);
    expect(normalizedPage.rows.map((row) => row.id)).toEqual([1]);
  });

  it("handles exotic comparable/filter values across sort and filter paths", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const rows = [
      {
        id: 1,
        sym: Symbol("alpha"),
        fn: namedFn,
        payload: circular,
        flag: true,
        big: 2n,
        at: new Date("2024-01-02T00:00:00.000Z"),
      },
      {
        id: 2,
        sym: Symbol("beta"),
        fn: () => "anon",
        payload: {
          nested: true,
        },
        flag: false,
        big: 1n,
        at: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        id: 3,
        sym: Symbol("gamma"),
        fn: otherFn,
        payload: undefined,
        flag: true,
        big: 3n,
        at: null as Date | null,
      },
    ] as const;

    const exoticColumns = defineColumns<typeof rows[number]>([
      { id: "id", accessor: (row) => row.id },
      { id: "sym", accessor: (row) => row.sym },
      { id: "fn", accessor: (row) => row.fn },
      { id: "payload", accessor: (row) => row.payload },
      { id: "flag", accessor: (row) => row.flag },
      { id: "big", accessor: (row) => row.big },
      { id: "at", accessor: (row) => row.at },
    ] as const);

    expect(sortRows(rows, exoticColumns, [{ id: "sym", direction: "asc" }]).length).toBe(rows.length);
    expect(sortRows(rows, exoticColumns, [{ id: "fn", direction: "desc" }]).length).toBe(rows.length);
    expect(sortRows(rows, exoticColumns, [{ id: "payload", direction: "asc" }]).length).toBe(rows.length);
    expect(sortRows(rows, exoticColumns, [{ id: "flag", direction: "desc" }]).map((row) => row.id)).toEqual([1, 3, 2]);
    expect(sortRows(rows, exoticColumns, [{ id: "big", direction: "asc" }]).map((row) => row.id)).toEqual([2, 1, 3]);
    expect(sortRows(rows, exoticColumns, [{ id: "at", direction: "asc" }]).map((row) => row.id)).toEqual([3, 2, 1]);

    const functionFilter = filterRows(rows, exoticColumns, [
      { id: "fn", value: "namedFn" },
    ]);
    expect(functionFilter.map((row) => row.id)).toEqual([1]);

    const symbolFilter = filterRows(rows, exoticColumns, [
      { id: "sym", value: "beta" },
    ]);
    expect(symbolFilter.map((row) => row.id)).toEqual([2]);

    const circularObjectFilter = filterRows(rows, exoticColumns, [
      { id: "payload", value: "{" },
    ]);
    expect(circularObjectFilter.map((row) => row.id)).toEqual([2]);
  });
});
