# Internal Utilities

## Purpose

Low-level utilities re-exported for advanced integrations.

## Imports

```ts
import {
  toMillis,
  toDuration,
  addDuration,
  isExpired,
  runEffect,
  createExternalStore,
  hashQueryKey,
  invariant,
  unreachable,
  getNestedValue,
  setNestedValue,
} from "@effect-react/react";
```

## Key APIs

- duration helpers: `toMillis`, `toDuration`, `addDuration`, `isExpired`
- runtime bridge: `runEffect`
- store primitive: `createExternalStore`
- key hashing: `hashQueryKey`, `KeyHasher`
- assertions: `invariant`, `unreachable`
- path helpers: `getNestedValue`, `setNestedValue`

## Behavior Guarantees

- helpers are deterministic and side-effect free, except explicit runtime bridge operations.

## Failure Model

- `invariant` and `unreachable` throw when violated.

## Minimal Example

```ts
import { hashQueryKey, toMillis } from "@effect-react/react";

const key = hashQueryKey(["users", { page: 1 }]);
const ttl = toMillis("30 seconds");
console.log(key, ttl);
```

## Related

- [`query.md`](query.md)
- [`provider.md`](provider.md)
