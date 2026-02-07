# Persistence

## Purpose

Persist query and subscription state to storage backends.

## Imports

```ts
import {
  createPersistenceStore,
  createMemoryStorage,
  persistQueryState,
  hydrateQueryState,
  persistSubscriptionState,
  hydratePersistedSnapshot,
} from "@effect-react/react/persistence";
```

## Key APIs

- store creation: `createPersistenceStore`, `createMemoryStorage`
- query persistence: `persistQueryState`, `hydrateQueryState`
- state snapshot persistence: `persistSubscriptionState`, `hydratePersistedSnapshot`
- interfaces: `PersistenceStorage`, `PersistenceCodec`, `PersistenceStore`

## Behavior Guarantees

- storage operations are codec-based and deterministic.
- query cache persistence works independently of transport layer.

## Failure Model

- codec and storage failures surface through Promise rejections.

## Minimal Example

```ts
import { createMemoryStorage, createPersistenceStore } from "@effect-react/react/persistence";

const store = createPersistenceStore({
  key: "app:query-cache",
  storage: createMemoryStorage(),
});
```

## Related

- [`query.md`](query.md)
- [`state.md`](state.md)
