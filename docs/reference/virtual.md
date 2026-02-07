# Virtual

## Purpose

Virtualized list and grid primitives with hook wrappers.

## Imports

```ts
import {
  createVirtualList,
  createVirtualGrid,
  useVirtualList,
  useVirtualGrid,
} from "@effect-react/react/virtual";
```

## Key APIs

- list model: `createVirtualList`, `useVirtualList`
- grid model: `createVirtualGrid`, `useVirtualGrid`
- types: `VirtualItem`, `VirtualRange`, `VirtualListState`, `VirtualGridState`

## Behavior Guarantees

- visible item ranges are computed deterministically from size/offset inputs.
- hook wrappers keep measurements synchronized with render lifecycle.

## Failure Model

- no dedicated domain errors; invalid measurement/config values should be validated by caller.

## Minimal Example

```ts
import { createVirtualList } from "@effect-react/react/virtual";

const list = createVirtualList({
  count: 1000,
  estimateSize: () => 32,
  viewportSize: 480,
  scrollOffset: 0,
});
```

## Related

- [`table.md`](table.md)
