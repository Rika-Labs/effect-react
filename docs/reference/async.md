# Async Utilities

## Purpose

Latest-wins guards and circuit breakers for async Effect/Promise workflows.

## Imports

```ts
import {
  createLatestTokenGuard,
  runLatestEffect,
  runLatestPromise,
  createCircuitBreaker,
  CircuitOpenError,
} from "@effect-react/react/async";
```

## Key APIs

- latest-wins: `createLatestTokenGuard`, `runLatestEffect`, `runLatestPromise`
- circuit breaker: `createCircuitBreaker`, `CircuitOpenError`
- types: `LatestResult`, `CircuitBreakerOptions`, `CircuitBreakerStats`

## Behavior Guarantees

- latest-token guard marks stale task completions as ignored.
- circuit breaker transitions between `closed`, `open`, and `half-open` states.

## Failure Model

- open-circuit execution fails fast with `CircuitOpenError`.

## Minimal Example

```ts
import { createLatestTokenGuard, runLatestPromise } from "@effect-react/react/async";

const guard = createLatestTokenGuard();
const result = await runLatestPromise(guard, () => fetch("/api/search?q=effect"));
if (result.status === "latest") {
  console.log(result.value);
}
```

## Related

- [`concurrency.md`](concurrency.md)
- [`policies.md`](policies.md)
