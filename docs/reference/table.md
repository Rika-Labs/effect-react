# Table

## Purpose

Headless table modeling and React hook integration for sorting, filtering, and pagination.

## Imports

```ts
import { createTableModel, createTableState, useTable } from "@effect-react/react/table";
```

## Key APIs

- model creation: `createTableModel`, `createTableState`
- React integration: `useTable`
- selection helper: `toggleRowSelection`
- types: `TableColumn`, `TableState`, `TableModel`, `TableRow`

## Behavior Guarantees

- table state transitions are pure and deterministic.
- hook integration keeps model updates synchronized with React rendering.

## Failure Model

- table helpers are pure operations; failures come from caller-provided logic.

## Minimal Example

```ts
import { createTableModel } from "@effect-react/react/table";

const table = createTableModel({
  rows: [{ id: "1", name: "Ada" }],
  getRowId: (row) => row.id,
  columns: [{ id: "name", header: "Name", accessor: (row) => row.name }],
});
```

## Related

- [`virtual.md`](virtual.md)
