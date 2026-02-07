# Scheduling

## Purpose

Run scheduled Effect tasks in React lifecycle scope.

## Imports

```ts
import {
  createScheduledRunner,
  useScheduledEffect,
  useIntervalEffect,
  useTimeoutEffect,
} from "@effect-react/react/scheduling";
```

## Key APIs

- scheduling model: `SchedulePolicy`, `ScheduledRunner`
- hook APIs: `useScheduledEffect`, `useIntervalEffect`, `useTimeoutEffect`
- lower-level runner: `createScheduledRunner`

## Behavior Guarantees

- interval and timeout executions are cleaned up automatically on unmount.
- schedule behavior is explicit by policy type.

## Failure Model

- Effect failures remain typed in the invoked task.

## Minimal Example

```tsx
import { Effect } from "effect";
import { useIntervalEffect } from "@effect-react/react/scheduling";

export function Heartbeat() {
  useIntervalEffect(Effect.log("tick"), "5 seconds", true);
  return null;
}
```

## Related

- [`streams.md`](streams.md)
- [`concurrency.md`](concurrency.md)
