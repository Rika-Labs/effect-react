# Provider

## Purpose

Supplies the Effect runtime and query cache context to React components.

## Imports

```ts
import { EffectProvider, useRuntime } from "@effect-react/react/provider";
```

## Key APIs

- `EffectProvider`
- `useRuntime`

## Behavior Guarantees

- `useRuntime` always resolves to the same runtime instance within provider scope.
- query hooks can share cache state when mounted under one provider.

## Failure Model

- Missing provider usage fails fast through runtime context invariant checks.

## Minimal Example

```tsx
import { Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "@effect-react/react/provider";

const runtime = ManagedRuntime.make(Layer.empty);

export function Root() {
  return (
    <EffectProvider runtime={runtime}>
      <App />
    </EffectProvider>
  );
}
```

## Related

- [`query.md`](query.md)
- [`server.md`](server.md)
