# Policies

## Purpose

Debounce and throttle Effectful tasks with cancellation semantics.

## Imports

```ts
import {
  createDebouncePolicy,
  createThrottlePolicy,
  useDebouncedRunner,
  useThrottledRunner,
} from "@effect-react/react/policies";
```

## Key APIs

- policy factories: `createDebouncePolicy`, `createThrottlePolicy`
- React helpers: `useDebouncedRunner`, `useThrottledRunner`
- error type: `PolicyCanceledError`

## Behavior Guarantees

- only eligible executions run based on debounce/throttle strategy.
- canceled executions are explicit and observable.

## Failure Model

- canceled work surfaces as `PolicyCanceledError`.

## Minimal Example

```tsx
import { useDebouncedRunner } from "@effect-react/react/policies";

export function SearchInput() {
  const run = useDebouncedRunner("300 millis");
  return <input onChange={(event) => run(() => Promise.resolve(event.target.value))} />;
}
```

## Related

- [`concurrency.md`](concurrency.md)
