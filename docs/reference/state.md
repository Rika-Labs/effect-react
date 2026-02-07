# State

## Purpose

Bridge Effect `SubscriptionRef` values and derived computations into React.

## Imports

```ts
import {
  useSubscriptionRef,
  useLocalSubscriptionRef,
  useDerived,
  useComputed,
  subscribeToRef,
} from "@effect-react/react/state";
```

## Key APIs

- hooks: `useSubscriptionRef`, `useLocalSubscriptionRef`, `useDerived`, `useComputed`
- integration helpers: `subscribeToRef`
- middleware: `createPersistMiddleware`, `createDevtoolsMiddleware`

## Behavior Guarantees

- subscriptions are synchronized with React external store semantics.
- derived values re-compute from source state consistently.

## Failure Model

- effectful update operations preserve typed Effect failures when run through runtime.

## Minimal Example

```tsx
import { Effect, SubscriptionRef } from "effect";
import { useSubscriptionRef } from "@effect-react/react/state";

const counterRef = await Effect.runPromise(SubscriptionRef.make(0));

export function Counter() {
  const { value, set } = useSubscriptionRef({ ref: counterRef });
  return <button onClick={() => set(value + 1)}>{value}</button>;
}
```

## Related

- [`persistence.md`](persistence.md)
- [`devtools.md`](devtools.md)
