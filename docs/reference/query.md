# Query

## Purpose

Effect-native query cache, fetch lifecycle, and React query hooks.

## Imports

```ts
import {
  QueryCache,
  useQuery,
  useSuspenseQuery,
  useInfiniteQuery,
  useQueryCache,
} from "@effect-react/react/query";
```

## Key APIs

- Cache and context: `QueryCache`, `useQueryCache`, `QueryCacheContext`
- Hooks: `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`
- Focus/reconnect triggers: `onWindowFocus`, `onWindowReconnect`
- Query hydration helpers: `dehydrate`, `hydrate`
- Types: `QueryKey`, `UseQueryOptions`, `InfiniteData`, `DehydratedState`

## Behavior Guarantees

- stale/refresh status transitions are tracked explicitly (`initial`, `loading`, `success`, `failure`, `refreshing`).
- cache invalidation and hydration operate on deterministic hashed query keys.
- suspense mode surfaces typed failures via `SuspenseQueryError`.

## Failure Model

- domain failures stay typed in `E`.
- suspense consumers can narrow errors with `isSuspenseQueryError`.

## Minimal Example

```tsx
import { Effect } from "effect";
import { useQuery } from "@effect-react/react/query";

export function Users() {
  const result = useQuery({
    key: ["users"],
    query: Effect.tryPromise(() => fetch("/api/users").then((r) => r.json())),
  });

  if (result.status === "loading") return <p>Loading...</p>;
  if (result.status === "failure") return <p>Failed</p>;
  return <pre>{JSON.stringify(result.data, null, 2)}</pre>;
}
```

## Related

- [`mutation.md`](mutation.md)
- [`ssr.md`](ssr.md)
- [`devtools.md`](devtools.md)
