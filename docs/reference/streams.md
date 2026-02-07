# Streams

## Purpose

React hooks for polling, SSE, WebSocket, and Effect streams.

## Imports

```ts
import {
  useStream,
  usePollingStream,
  useEventSourceStream,
  useWebSocketStream,
} from "@effect-react/react/streams";
```

## Key APIs

- core stream hook: `useStream`
- browser transports: `usePollingStream`, `useEventSourceStream`, `useWebSocketStream`
- backoff model: `BackoffPolicy`

## Behavior Guarantees

- reconnect/backoff strategy is explicit and configurable.
- stream subscriptions follow component lifecycle and cleanup semantics.

## Failure Model

- stream errors are surfaced through hook callbacks/state channels.

## Minimal Example

```tsx
import { usePollingStream } from "@effect-react/react/streams";

export function PollingWidget() {
  usePollingStream({
    interval: "5 seconds",
    poll: async () => {
      await fetch("/api/ping");
    },
  });
  return null;
}
```

## Related

- [`scheduling.md`](scheduling.md)
- [`events.md`](events.md)
