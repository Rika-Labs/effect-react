# Optimistic Queue

## Purpose

Manage optimistic state updates with rollback and replay behavior.

## Imports

```ts
import {
  createOptimisticQueue,
  enqueueOptimisticMutation,
  rollbackOptimisticMutation,
  replayPendingMutations,
} from "@effect-react/react/optimistic";
```

## Key APIs

- `createOptimisticQueue`
- `enqueueOptimisticMutation`
- `rollbackOptimisticMutation`
- `replayPendingMutations` and `replayPendingMutationsEffect`

## Behavior Guarantees

- queue maintains canonical optimistic state and pending mutation log.
- rollback and replay operations are deterministic by mutation id/order.

## Failure Model

- replay effects can fail with caller-specified mutation error channels.

## Minimal Example

```ts
import { createOptimisticQueue, enqueueOptimisticMutation } from "@effect-react/react/optimistic";

const queue = createOptimisticQueue({ count: 0 });
enqueueOptimisticMutation(queue, {
  id: "m1",
  apply: (state) => ({ count: state.count + 1 }),
  rollback: (state) => ({ count: state.count - 1 }),
  run: async () => {
    await fetch("/api/increment", { method: "POST" });
  },
});
```

## Related

- [`mutation.md`](mutation.md)
- [`query.md`](query.md)
