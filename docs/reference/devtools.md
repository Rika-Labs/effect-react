# Devtools

## Purpose

Inspect query cache state and derive diagnostics summaries.

## Imports

```ts
import { snapshotQueryCache, summarizeQueryDiagnostics } from "@effect-react/react/devtools";
```

## Key APIs

- `snapshotQueryCache`
- `summarizeQueryDiagnostics`
- type: `QueryDiagnosticsSummary`

## Behavior Guarantees

- diagnostics snapshot is read-only and does not mutate cache state.

## Failure Model

- no dedicated runtime failures; diagnostics reflect current cache state.

## Minimal Example

```ts
import { QueryCache } from "@effect-react/react/query";
import { snapshotQueryCache } from "@effect-react/react/devtools";

const cache = new QueryCache();
console.log(snapshotQueryCache(cache));
```

## Related

- [`query.md`](query.md)
