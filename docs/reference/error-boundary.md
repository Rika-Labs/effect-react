# Error Boundary

## Purpose

React error boundary that classifies Effect-related failures by kind.

## Imports

```ts
import { EffectErrorBoundary } from "@effect-react/react/error-boundary";
```

## Key APIs

- `EffectErrorBoundary`
- types: `EffectBoundaryErrorKind`, `EffectBoundaryFallbackProps`, `EffectBoundaryFallback`

## Behavior Guarantees

- interruptions, typed failures, and defects are distinguishable at fallback render time.

## Failure Model

- boundary consumes thrown errors and renders configured fallback strategy.

## Minimal Example

```tsx
import { EffectErrorBoundary } from "@effect-react/react/error-boundary";

export function AppShell() {
  return (
    <EffectErrorBoundary
      fallback={({ kind, message }) => (
        <p>
          {kind}: {message}
        </p>
      )}
    >
      <App />
    </EffectErrorBoundary>
  );
}
```

## Related

- [`query.md`](query.md)
- [`server.md`](server.md)
