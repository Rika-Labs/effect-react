# Mutation

## Purpose

Run Effect mutations from React with typed status and cache invalidation.

## Imports

```ts
import { useMutation } from "@effect-react/react/mutation";
```

## Key APIs

- `useMutation`
- types: `MutationStatus`, `UseMutationOptions`, `UseMutationResult`
- optimistic options: `MutationOptimisticOptions`

## Behavior Guarantees

- mutation lifecycle status is explicit (`initial`, `pending`, `success`, `failure`).
- invalidation targets can be query keys or predicates.

## Failure Model

- mutation errors remain typed in `E` and are available in hook state.

## Minimal Example

```tsx
import { Effect } from "effect";
import { useMutation } from "@effect-react/react/mutation";

export function CreateUser() {
  const { mutate, status } = useMutation({
    mutation: (name: string) =>
      Effect.tryPromise(() =>
        fetch("/api/users", { method: "POST", body: JSON.stringify({ name }) }),
      ),
    invalidate: [["users"]],
  });

  return (
    <button disabled={status === "pending"} onClick={() => mutate("Ada")}>
      Create
    </button>
  );
}
```

## Related

- [`query.md`](query.md)
- [`optimistic.md`](optimistic.md)
