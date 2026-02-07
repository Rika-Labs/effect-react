import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import {
  createTableModel,
  createTableState,
  toggleRowSelection,
  useTable,
  type TableColumn,
  type TableState,
} from "../table";
import { createVirtualGrid, createVirtualList, useVirtualGrid, useVirtualList } from "../virtual";

interface UserRow {
  readonly id: string;
  readonly score: number;
}

const columns: readonly TableColumn<UserRow, unknown>[] = [
  {
    id: "id",
    accessor: (row) => row.id,
  },
  {
    id: "score",
    accessor: (row) => row.score,
    sort: (left, right) => Number(left) - Number(right),
  },
];

describe("table + virtual", () => {
  it("builds table model with sorting, filter, and pagination", () => {
    const model = createTableModel({
      data: [
        { id: "a", score: 3 },
        { id: "b", score: 1 },
        { id: "c", score: 2 },
      ],
      columns,
      state: createTableState({
        sort: { columnId: "score" },
        globalFilter: "",
        pageIndex: 0,
        pageSize: 2,
      }),
      getRowId: (row) => row.id,
    });

    expect(model.rows.map((row) => row.original.id)).toEqual(["b", "c", "a"]);
    expect(model.pageRows.map((row) => row.original.id)).toEqual(["b", "c"]);
    expect(model.pageCount).toBe(2);
  });

  it("supports filtering and selection toggling helpers", () => {
    const state = createTableState({
      globalFilter: "a",
    });

    const model = createTableModel({
      data: [
        { id: "alpha", score: 3 },
        { id: "beta", score: 1 },
      ],
      columns,
      state,
      getRowId: (row) => row.id,
    });

    expect(model.rows.length).toBe(2);

    const selected = toggleRowSelection(state, "alpha");
    expect(selected.rowSelection["alpha"]).toBe(true);
    const unselected = toggleRowSelection(selected, "alpha");
    expect(unselected.rowSelection["alpha"]).toBeUndefined();
  });

  it("manages table state through useTable", async () => {
    const Probe = () => {
      const table = useTable({
        data: [
          { id: "x", score: 10 },
          { id: "y", score: 20 },
        ],
        columns,
        getRowId: (row) => row.id,
      });

      return (
        <div>
          <button onClick={() => table.setSort({ columnId: "score", desc: true })}>sort</button>
          <div data-testid="first">{table.model.rows[0]?.original.id ?? "-"}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("first").textContent).toBe("x");

    screen.getByRole("button", { name: "sort" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("first").textContent).toBe("y");
    });
  });

  it("supports controlled table state updates through callbacks", () => {
    const onStateChange: TableState[] = [];

    const Probe = () => {
      const table = useTable({
        data: [{ id: "x", score: 10 }],
        columns,
        state: createTableState({
          pageIndex: 1,
          pageSize: 1,
          rowSelection: {},
        }),
        onStateChange: (next) => {
          onStateChange.push(next);
        },
      });

      return (
        <div>
          <button onClick={() => table.setGlobalFilter("x")}>filter</button>
          <button onClick={() => table.setPageIndex(-5)}>page-index</button>
          <button onClick={() => table.setPageSize(0)}>page-size</button>
          <button onClick={() => table.toggleRowSelection("x")}>select</button>
        </div>
      );
    };

    render(<Probe />);

    screen.getByRole("button", { name: "filter" }).click();
    screen.getByRole("button", { name: "page-index" }).click();
    screen.getByRole("button", { name: "page-size" }).click();
    screen.getByRole("button", { name: "select" }).click();

    expect(onStateChange).toHaveLength(4);
    expect(onStateChange[1]?.pageIndex).toBe(0);
    expect(onStateChange[2]?.pageSize).toBe(1);
    expect(onStateChange[3]?.rowSelection["x"]).toBe(true);
  });

  it("computes virtual list and virtual grid ranges", () => {
    const list = createVirtualList({
      count: 100,
      estimateSize: () => 10,
      scrollOffset: 20,
      viewportSize: 30,
      overscan: 1,
    });

    expect(list.range.startIndex).toBe(1);
    expect(list.range.endIndex).toBe(5);
    expect(list.items.length).toBe(5);
    expect(list.totalSize).toBe(1000);

    const grid = createVirtualGrid({
      rowCount: 50,
      columnCount: 20,
      estimateRowSize: () => 20,
      estimateColumnSize: () => 40,
      scrollTop: 60,
      scrollLeft: 80,
      viewportHeight: 80,
      viewportWidth: 120,
      overscan: 1,
    });

    expect(grid.rows.items.length).toBeGreaterThan(0);
    expect(grid.columns.items.length).toBeGreaterThan(0);
  });

  it("supports dynamic measurements through useVirtualList", async () => {
    const Probe = () => {
      const virtual = useVirtualList({
        count: 10,
        estimateSize: () => 10,
        scrollOffset: 0,
        viewportSize: 25,
      });

      return (
        <div>
          <button onClick={() => virtual.measure(0, 30)}>measure</button>
          <div data-testid="size">{String(virtual.state.items[0]?.size ?? 0)}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("size").textContent).toBe("10");

    screen.getByRole("button", { name: "measure" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("size").textContent).toBe("30");
    });
  });

  it("supports fixed itemHeight as shorthand for estimateSize", () => {
    const Probe = () => {
      const virtual = useVirtualList({
        count: 5,
        itemHeight: 20,
        scrollOffset: 0,
        viewportSize: 50,
      });

      return (
        <div>
          <div data-testid="total">{String(virtual.state.totalSize)}</div>
          <div data-testid="item-size">{String(virtual.state.items[0]?.size ?? 0)}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("total").textContent).toBe("100");
    expect(screen.getByTestId("item-size").textContent).toBe("20");
  });

  it("prefers estimateSize over itemHeight when both provided", () => {
    const Probe = () => {
      const virtual = useVirtualList({
        count: 5,
        estimateSize: () => 15,
        itemHeight: 20,
        scrollOffset: 0,
        viewportSize: 50,
      });

      return <div data-testid="item-size">{String(virtual.state.items[0]?.size ?? 0)}</div>;
    };

    render(<Probe />);
    expect(screen.getByTestId("item-size").textContent).toBe("15");
  });

  it("supports dynamic row and column measurements through useVirtualGrid", async () => {
    const Probe = () => {
      const virtual = useVirtualGrid({
        rowCount: 5,
        columnCount: 5,
        estimateRowSize: () => 10,
        estimateColumnSize: () => 10,
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 20,
        viewportWidth: 20,
      });

      return (
        <div>
          <button
            onClick={() => {
              virtual.measureRow(0, 30);
              virtual.measureColumn(0, 25);
            }}
          >
            measure-grid
          </button>
          <div data-testid="row-size">{String(virtual.state.rows.items[0]?.size ?? 0)}</div>
          <div data-testid="col-size">{String(virtual.state.columns.items[0]?.size ?? 0)}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("row-size").textContent).toBe("10");
    expect(screen.getByTestId("col-size").textContent).toBe("10");

    screen.getByRole("button", { name: "measure-grid" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("row-size").textContent).toBe("30");
      expect(screen.getByTestId("col-size").textContent).toBe("25");
    });
  });
});
