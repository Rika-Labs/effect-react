# URL State

## Purpose

Typed codecs and hooks for synchronizing UI state with URL search params.

## Imports

```ts
import {
  defineSearchSchema,
  useUrlState,
  useUrlStates,
  stringCodec,
  numberCodec,
} from "@effect-react/react/url-state";
```

## Key APIs

- schema helpers: `defineSearchSchema`, `createSearchAdapter`
- hooks: `useUrlState`, `useUrlStates`
- codec primitives: `stringCodec`, `numberCodec`, `booleanCodec`, `enumCodec`, `jsonCodec`, `dateCodec`, `arrayCodec`
- parsing/serialization: `parseSearch`, `serializeSearch`

## Behavior Guarantees

- decode/encode logic is centralized in codecs.
- URL synchronization preserves typed state shape via schema inference.

## Failure Model

- decode failures fallback according to codec behavior and schema defaults.

## Minimal Example

```tsx
import { defineSearchSchema, numberCodec, useUrlStates } from "@effect-react/react/url-state";

const schema = defineSearchSchema({ page: numberCodec });

export function Pager() {
  const [search, setSearch] = useUrlStates(schema);
  return <button onClick={() => setSearch({ page: (search.page ?? 1) + 1 })}>Next</button>;
}
```

## Related

- [`router.md`](router.md)
