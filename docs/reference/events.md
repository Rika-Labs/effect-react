# Events

## Purpose

Type-safe local event channels for publish/subscribe flows.

## Imports

```ts
import { createEventChannel } from "@effect-react/react/events";
```

## Key APIs

- `createEventChannel`
- types: `EventChannel`, `EventEnvelope`, `EventChannelOptions`

## Behavior Guarantees

- event names and payloads remain type-safe per channel definition.
- listeners can be subscribed/unsubscribed deterministically.

## Failure Model

- channel operations are synchronous unless wrapped in Effect by caller.

## Minimal Example

```ts
const channel = createEventChannel<{ userCreated: { id: string } }>();
const unsubscribe = channel.on("userCreated", (event) => {
  console.log(event.id);
});
channel.emit("userCreated", { id: "u_1" });
unsubscribe();
```

## Related

- [`streams.md`](streams.md)
