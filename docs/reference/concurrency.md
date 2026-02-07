# Concurrency

## Purpose

Control throughput and parallelism with semaphores, queues, and rate-limited runners.

## Imports

```ts
import {
  withConcurrencyLimit,
  createTaskQueue,
  createRateLimitedRunner,
  useSemaphore,
} from "@effect-react/react/concurrency";
```

## Key APIs

- limiting wrappers: `withConcurrencyLimit`
- queue orchestration: `createTaskQueue`
- token-rate control: `createRateLimitedRunner`
- React integration: `useSemaphore`
- error types: `QueueOverflowError`, `QueueCanceledError`

## Behavior Guarantees

- queue overflow behavior is explicit (`backpressure`, `drop`, `slide`).
- concurrency limits are deterministic based on configured permits.

## Failure Model

- overflow and cancellation failures have dedicated error types.

## Minimal Example

```ts
import { createTaskQueue } from "@effect-react/react/concurrency";

const queue = createTaskQueue({ concurrency: 4, capacity: 100, overflow: "backpressure" });
await queue.push(async () => {
  await fetch("/api/work");
});
```

## Related

- [`policies.md`](policies.md)
- [`scheduling.md`](scheduling.md)
