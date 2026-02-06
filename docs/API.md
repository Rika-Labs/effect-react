# API Reference

Complete API reference for `@rika-labs/effect-react`.

---

## Table of Contents

- [Provider](#provider)
- [Query](#query)
- [Mutation](#mutation)
- [State](#state)
- [Forms](#forms)
- [Async (Circuit Breaker & Latest Token Guard)](#async-circuit-breaker--latest-token-guard)
- [Concurrency](#concurrency)
- [Policies](#policies)
- [Scheduling](#scheduling)
- [Streams](#streams)
- [Browser](#browser)
- [Error Boundary](#error-boundary)
- [Events](#events)
- [Optimistic](#optimistic)
- [Persistence](#persistence)
- [SSR](#ssr)
- [Framework + CLI](#framework--cli)
- [Devtools](#devtools)
- [Internal Utilities](#internal-utilities)

---

## Provider

### `EffectProvider`

Root provider component that supplies the Effect runtime and query cache to all child components.

**Props:**

| Name       | Type            | Required | Description                                                           |
| ---------- | --------------- | -------- | --------------------------------------------------------------------- |
| `runtime`  | `EffectRuntime` | Yes      | An Effect managed runtime instance                                    |
| `cache`    | `QueryCache`    | No       | Optional shared query cache. A new `QueryCache` is created if omitted |
| `children` | `ReactNode`     | Yes      | Child components                                                      |

**Example:**

```tsx
import { ManagedRuntime } from "effect";
import { EffectProvider } from "@rika-labs/effect-react";

const runtime = ManagedRuntime.make(Layer.empty);

function App() {
  return (
    <EffectProvider runtime={runtime}>
      <MyApp />
    </EffectProvider>
  );
}
```

---

### `useRuntime()`

React hook that returns the current `EffectRuntime` from the nearest `EffectProvider`.

**Returns:** `EffectRuntime`

Throws if called outside of an `EffectProvider`.

**Example:**

```tsx
const runtime = useRuntime();
```

---

### `EffectRuntime`

Interface representing the runtime provided to `EffectProvider`.

| Property         | Type                                                                                             | Description                         |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `runPromiseExit` | `<A, E>(effect: Effect<A, E, never>, options?: { signal?: AbortSignal }) => Promise<Exit<A, E>>` | Runs an effect and returns its exit |
| `dispose`        | `() => Promise<void>`                                                                            | Disposes the runtime                |

---

## Query

### `QueryCache`

Central cache for managing query state, subscriptions, garbage collection, and dehydration/hydration.

#### `new QueryCache(options?)`

| Option             | Type            | Default          | Description                                           |
| ------------------ | --------------- | ---------------- | ----------------------------------------------------- |
| `defaultStaleTime` | `DurationInput` | `0`              | Default duration before data becomes stale            |
| `defaultGcTime`    | `DurationInput` | `300000` (5 min) | Default garbage collection timeout for unused entries |
| `keyHasher`        | `KeyHasher`     | `hashQueryKey`   | Custom key hashing function                           |
| `now`              | `() => number`  | `Date.now`       | Clock function for timestamps                         |

#### Methods

##### `ensureEntry<A, E>(options)`

Gets or creates a cache entry for the given key.

| Parameter     | Type            | Required | Description                    |
| ------------- | --------------- | -------- | ------------------------------ |
| `key`         | `QueryKey`      | Yes      | Query key                      |
| `staleTime`   | `DurationInput` | No       | Stale time override            |
| `gcTime`      | `DurationInput` | No       | GC time override               |
| `initialData` | `A`             | No       | Initial data to seed the entry |
| `keyHasher`   | `KeyHasher`     | No       | Key hasher override            |

**Returns:** `QueryEntry<A, E>`

##### `fetch<A, E, R, ER>(options)`

Fetches data for a query entry, managing in-flight deduplication and cancellation.

| Parameter     | Type                     | Required | Description                         |
| ------------- | ------------------------ | -------- | ----------------------------------- |
| `key`         | `QueryKey`               | Yes      | Query key                           |
| `runtime`     | `EffectRuntime`          | Yes      | Effect runtime to execute the query |
| `query`       | `Effect<A, E, R>`        | Yes      | The Effect to run                   |
| `entry`       | `QueryEntry<A, E \| ER>` | No       | Existing entry to use               |
| `force`       | `boolean`                | No       | Force refetch even if in-flight     |
| `staleTime`   | `DurationInput`          | No       | Stale time override                 |
| `gcTime`      | `DurationInput`          | No       | GC time override                    |
| `initialData` | `A`                      | No       | Initial data                        |
| `keyHasher`   | `KeyHasher`              | No       | Key hasher override                 |

**Returns:** `Promise<QueryResult<A, E | ER>>`

##### `prefetch<A, E, R, ER>(options)`

Same as `fetch` but returns `Promise<void>`. Useful for warming the cache.

##### `getQueryData<A>(key, keyHasher?)`

Returns the cached data for a key, or `undefined` if not present.

**Returns:** `A | undefined`

##### `setQueryData<A, E>(key, data, options?)`

Directly sets data in the cache for the given key.

##### `invalidate(target?, keyHasher?)`

Marks matching entries as stale and triggers refetch for entries with active subscribers.

| Parameter   | Type                                       | Description                                                   |
| ----------- | ------------------------------------------ | ------------------------------------------------------------- |
| `target`    | `QueryKey \| ((key: QueryKey) => boolean)` | Key to invalidate, predicate function, or `undefined` for all |
| `keyHasher` | `KeyHasher`                                | Key hasher override                                           |

##### `removeQuery(key, keyHasher?)`

Removes a query entry from the cache. Returns `true` if the entry existed.

##### `hasQuery(key, keyHasher?)`

Returns `true` if an entry exists for the given key.

##### `size()`

Returns the number of entries in the cache.

##### `diagnostics()`

Returns a `QueryCacheDiagnosticsSnapshot` with detailed information about every cache entry.

##### `clear()`

Removes all entries from the cache, cancelling in-flight requests.

##### `dehydrate()`

Serializes all successful query entries into a `DehydratedState` for SSR.

**Returns:** `DehydratedState`

##### `hydrate(state)`

Restores entries from a `DehydratedState` into the cache.

**Example:**

```ts
const cache = new QueryCache({
  defaultStaleTime: 30_000,
  defaultGcTime: 5 * 60_000,
});

cache.setQueryData(["users", 1], { id: 1, name: "Alice" });
cache.invalidate(["users", 1]);
```

---

### `useQuery<A, E, R, S>(options)`

React hook for declarative data fetching with automatic caching, refetching, and stale management.

**Options (`UseQueryOptions<A, E, R, S>`):**

| Option                 | Type                                       | Default       | Description                                                  |
| ---------------------- | ------------------------------------------ | ------------- | ------------------------------------------------------------ |
| `key`                  | `QueryKey`                                 | **Required**  | Unique key identifying this query                            |
| `query`                | `Effect<A, E, R> \| () => Effect<A, E, R>` | **Required**  | The effect or effect factory to execute                      |
| `enabled`              | `boolean`                                  | `true`        | Whether the query is enabled                                 |
| `staleTime`            | `DurationInput`                            | Cache default | Time before data becomes stale                               |
| `gcTime`               | `DurationInput`                            | Cache default | Garbage collection timeout                                   |
| `initialData`          | `A`                                        | -             | Initial data to seed the cache                               |
| `placeholderData`      | `S`                                        | -             | Placeholder while loading (surface shows `"success"` status) |
| `select`               | `(data: A) => S`                           | -             | Transform raw data before returning                          |
| `keepPreviousData`     | `boolean`                                  | `false`       | Keep previous data while loading new data                    |
| `refetchOnWindowFocus` | `boolean`                                  | `true`        | Refetch when window regains focus                            |
| `refetchOnReconnect`   | `boolean`                                  | `true`        | Refetch when network reconnects                              |
| `keyHasher`            | `KeyHasher`                                | Cache default | Custom key hasher                                            |

**Returns (`UseQueryResult<S, E>`):**

| Property     | Type                    | Description                                                        |
| ------------ | ----------------------- | ------------------------------------------------------------------ |
| `status`     | `QueryStatus`           | `"initial" \| "loading" \| "success" \| "failure" \| "refreshing"` |
| `data`       | `S \| undefined`        | The query data (selected/transformed)                              |
| `cause`      | `Cause<E> \| undefined` | Error cause on failure                                             |
| `updatedAt`  | `number \| null`        | Timestamp of last successful update                                |
| `isStale`    | `boolean`               | Whether the data is stale                                          |
| `refetch`    | `() => Promise<void>`   | Force refetch the query                                            |
| `invalidate` | `() => void`            | Invalidate this query in the cache                                 |

**Example:**

```tsx
const { data, status, refetch } = useQuery({
  key: ["users", userId],
  query: Effect.tryPromise(() => fetch(`/api/users/${userId}`).then((r) => r.json())),
  staleTime: 30_000,
});
```

---

### `useSuspenseQuery<A, E, R, S>(options)`

Like `useQuery` but integrates with React Suspense. Throws a promise while loading and throws `SuspenseQueryError` on failure.

**Options:** Same as `UseQueryOptions<A, E, R, S>`.

**Returns (`UseSuspenseQueryResult<S, E>`):**

| Property     | Type                        | Description                             |
| ------------ | --------------------------- | --------------------------------------- |
| `data`       | `S`                         | Always defined (guaranteed by Suspense) |
| `status`     | `"success" \| "refreshing"` | Only success states                     |
| `cause`      | `Cause<E> \| undefined`     | Error cause                             |
| `updatedAt`  | `number \| null`            | Last update timestamp                   |
| `isStale`    | `boolean`                   | Whether data is stale                   |
| `refetch`    | `() => Promise<void>`       | Force refetch                           |
| `invalidate` | `() => void`                | Invalidate this query                   |

**Example:**

```tsx
function UserProfile({ id }: { id: string }) {
  const { data } = useSuspenseQuery({
    key: ["user", id],
    query: fetchUser(id),
  });

  return <div>{data.name}</div>;
}
```

---

### `SuspenseQueryError<E>`

Error class thrown by `useSuspenseQuery` on failure.

| Property     | Type       | Description                 |
| ------------ | ---------- | --------------------------- |
| `queryCause` | `Cause<E>` | The underlying Effect cause |

### `isSuspenseQueryError<E>(error)`

Type guard for `SuspenseQueryError`.

**Returns:** `error is SuspenseQueryError<E>`

---

### `useQueryCache()`

Returns the `QueryCache` from the nearest `EffectProvider`.

**Returns:** `QueryCache`

---

### `QueryCacheContext`

React context holding the `QueryCache`. Typically accessed via `useQueryCache()`.

---

### Types

```ts
type QueryKey = readonly unknown[];
type QueryStatus = "initial" | "loading" | "success" | "failure" | "refreshing";

interface QueryResult<A, E> {
  readonly status: QueryStatus;
  readonly data: A | undefined;
  readonly cause: Cause<E> | undefined;
  readonly updatedAt: number | null;
  readonly isStale: boolean;
}

interface DehydratedState {
  readonly version: 1;
  readonly queries: readonly DehydratedQuery[];
}

interface DehydratedQuery {
  readonly key: QueryKey;
  readonly hash: string;
  readonly data: unknown;
  readonly updatedAt: number;
  readonly staleTimeMs: number;
  readonly gcTimeMs: number;
  readonly isStale: boolean;
}
```

---

### `dehydrate(cache)` / `hydrate(cache, state)` (Query SSR)

Convenience functions for server-side rendering query state.

```ts
// Server
const state = dehydrate(cache);

// Client
hydrate(cache, state);
```

---

### `onWindowFocus(listener, target?)` / `onWindowReconnect(listener, target?)`

Low-level helpers that register `"focus"` and `"online"` event listeners on the window.

**Returns:** `() => void` -- cleanup function

---

## Mutation

### `useMutation<V, A, E, R>(options)`

React hook for executing side-effectful mutations with optimistic updates, cache invalidation, and lifecycle callbacks.

**Options (`UseMutationOptions<V, A, E, R>`):**

| Option       | Type                                                                    | Required | Description                                    |
| ------------ | ----------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `mutation`   | `((variables: V) => Effect<A, E, R>) \| Effect<A, E, R>`                | Yes      | The mutation effect or factory                 |
| `invalidate` | `readonly MutationInvalidationTarget[]`                                 | No       | Query keys/predicates to invalidate on success |
| `optimistic` | `MutationOptimisticOptions<V, E>`                                       | No       | Optimistic update config                       |
| `onSuccess`  | `(data: A, variables: V) => void \| Promise<void>`                      | No       | Called on success                              |
| `onError`    | `(cause: Cause<E>, variables: V) => void \| Promise<void>`              | No       | Called on failure                              |
| `onSettled`  | `(result: MutationResult<A, E>, variables: V) => void \| Promise<void>` | No       | Called after success or failure                |

**Returns (`UseMutationResult<V, A, E>`):**

| Property      | Type                                    | Description                                        |
| ------------- | --------------------------------------- | -------------------------------------------------- |
| `status`      | `MutationStatus`                        | `"initial" \| "pending" \| "success" \| "failure"` |
| `data`        | `A \| undefined`                        | Result data                                        |
| `cause`       | `Cause<E> \| undefined`                 | Error cause on failure                             |
| `submittedAt` | `number \| null`                        | Timestamp of last submission                       |
| `mutate`      | `(variables: V) => Promise<Exit<A, E>>` | Execute the mutation                               |
| `cancel`      | `() => void`                            | Cancel the in-flight mutation                      |
| `reset`       | `() => void`                            | Reset to initial state                             |

**Example:**

```tsx
const { mutate, status } = useMutation({
  mutation: (data: CreateUserInput) =>
    Effect.tryPromise(() =>
      fetch("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ),
  invalidate: [["users"]],
  onSuccess: (data) => console.log("Created:", data),
});

await mutate({ name: "Alice" });
```

---

### Types

```ts
type MutationStatus = "initial" | "pending" | "success" | "failure";
type MutationInvalidationTarget = QueryKey | ((key: QueryKey) => boolean);

interface MutationResult<A, E> {
  readonly status: MutationStatus;
  readonly data: A | undefined;
  readonly cause: Cause<E> | undefined;
  readonly submittedAt: number | null;
}

interface MutationOptimisticOptions<V, E> {
  readonly apply: (variables: V) => void;
  readonly rollback: (variables: V, cause: Cause<E>) => void;
}
```

---

## State

### `useSubscriptionRef<A, S>(options)`

React hook that subscribes to an Effect `SubscriptionRef` and provides reactive read/write access.

**Options (`UseSubscriptionRefOptions<A, S>`):**

| Option    | Type                             | Required | Description                                  |
| --------- | -------------------------------- | -------- | -------------------------------------------- |
| `ref`     | `SubscriptionRef<A>`             | Yes      | The SubscriptionRef to observe               |
| `initial` | `A`                              | Yes      | Initial value before the subscription fires  |
| `select`  | `(value: A) => S`                | No       | Optional selector to derive a value          |
| `equals`  | `(left: S, right: S) => boolean` | No       | Custom equality check (default: `Object.is`) |

**Returns (`UseSubscriptionRefResult<A, S>`):**

| Property | Type                                          | Description                    |
| -------- | --------------------------------------------- | ------------------------------ |
| `value`  | `S`                                           | Current (selected) value       |
| `set`    | `(value: A) => Promise<void>`                 | Set the ref to a new value     |
| `update` | `(updater: (value: A) => A) => Promise<void>` | Update the ref with a function |

**Example:**

```tsx
const { value, set } = useSubscriptionRef({
  ref: counterRef,
  initial: 0,
});
```

---

### `useLocalSubscriptionRef<A, S>(options)`

Creates and manages a local `SubscriptionRef` scoped to the component lifecycle.

**Options (`UseLocalSubscriptionRefOptions<A, S>`):**

| Option    | Type                             | Required | Description           |
| --------- | -------------------------------- | -------- | --------------------- |
| `initial` | `A`                              | Yes      | Initial value         |
| `select`  | `(value: A) => S`                | No       | Optional selector     |
| `equals`  | `(left: S, right: S) => boolean` | No       | Custom equality check |

**Returns (`UseLocalSubscriptionRefResult<A, S>`):**

| Property | Type                                          | Description                           |
| -------- | --------------------------------------------- | ------------------------------------- |
| `value`  | `S`                                           | Current (selected) value              |
| `ready`  | `boolean`                                     | Whether the ref has been created      |
| `ref`    | `SubscriptionRef<A> \| null`                  | The underlying ref (null until ready) |
| `set`    | `(value: A) => Promise<void>`                 | Set the ref value                     |
| `update` | `(updater: (value: A) => A) => Promise<void>` | Update the ref with a function        |

**Example:**

```tsx
const { value, ready, set } = useLocalSubscriptionRef({ initial: 0 });

if (!ready) return <Loading />;
return <Counter value={value} onIncrement={() => set(value + 1)} />;
```

---

### `useDerived<A, S>(value, select, options?)`

Memoizes a derived value from a source value, only updating when the selected result changes.

| Parameter        | Type                             | Required | Description                            |
| ---------------- | -------------------------------- | -------- | -------------------------------------- |
| `value`          | `A`                              | Yes      | Source value                           |
| `select`         | `(value: A) => S`                | Yes      | Selector/transform function            |
| `options.equals` | `(left: S, right: S) => boolean` | No       | Custom equality (default: `Object.is`) |

**Returns:** `S`

**Example:**

```tsx
const fullName = useDerived(user, (u) => `${u.first} ${u.last}`);
```

---

## Forms

### `useForm<T>(options)`

Full-featured form management hook with validation, submission, and field registration.

**Options (`UseFormOptions<T>`):**

| Option          | Type                                                                            | Required | Description                                       |
| --------------- | ------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| `initialValues` | `T`                                                                             | Yes      | Initial form values                               |
| `validate`      | `(values: T) => FormErrors<T> \| Promise<FormErrors<T>>`                        | No       | Form-level validation                             |
| `validateField` | `(field, value, values) => string \| undefined \| Promise<string \| undefined>` | No       | Field-level validation                            |
| `onSubmit`      | `(values: T) => Effect \| Promise`                                              | No       | Submit handler (supports both Effect and Promise) |

**Returns (`UseFormResult<T>`):**

| Property        | Type                               | Description                            |
| --------------- | ---------------------------------- | -------------------------------------- |
| `values`        | `T`                                | Current form values                    |
| `errors`        | `FormErrors<T>`                    | Current validation errors              |
| `touched`       | `FormTouched<T>`                   | Map of touched fields                  |
| `dirty`         | `boolean`                          | Whether any values differ from initial |
| `isSubmitting`  | `boolean`                          | Whether a submit is in progress        |
| `setFieldValue` | `(field, value) => void`           | Set a single field value               |
| `blurField`     | `(field) => void`                  | Mark a field as touched                |
| `register`      | `(field) => RegisteredField<T, K>` | Get props for a field                  |
| `validateField` | `(field) => Promise<boolean>`      | Validate a single field                |
| `validateForm`  | `() => Promise<boolean>`           | Validate all fields                    |
| `submit`        | `() => Promise<boolean>`           | Validate and submit                    |
| `cancelSubmit`  | `() => void`                       | Cancel in-flight submit                |
| `reset`         | `() => void`                       | Reset to initial values                |

**`RegisteredField<T, K>`:**

| Property   | Type                    | Description                        |
| ---------- | ----------------------- | ---------------------------------- |
| `name`     | `K`                     | Field name                         |
| `value`    | `T[K]`                  | Current field value                |
| `error`    | `string \| undefined`   | Validation error                   |
| `touched`  | `boolean`               | Whether the field has been blurred |
| `onChange` | `(value: T[K]) => void` | Value change handler               |
| `onBlur`   | `() => void`            | Blur handler                       |

**Example:**

```tsx
const form = useForm({
  initialValues: { email: "", password: "" },
  validate: (values) => ({
    ...(values.email ? {} : { email: "Required" }),
    ...(values.password.length >= 8 ? {} : { password: "Min 8 chars" }),
  }),
  onSubmit: (values) =>
    Effect.tryPromise(() =>
      fetch("/api/login", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    ),
});

const emailField = form.register("email");
```

---

### Types

```ts
type FormErrors<T> = Partial<Record<keyof T, string>>;
type FormTouched<T> = Partial<Record<keyof T, boolean>>;
```

---

## HTTP → Use @effect/platform

Effect provides a full HTTP client. See [@effect/platform HttpClient docs](https://effect.website/docs/platform/http-client).

---

## Async (Circuit Breaker & Latest Token Guard)

**Note:** For retry and timeout, use Effect's built-in primitives:

- **Retry:** [`Effect.retry()`](https://effect.website/docs/scheduling/schedules) with `Schedule`
- **Timeout:** [`Effect.timeout()`](https://effect.website/docs/scheduling/timeout)

---

### `createLatestTokenGuard()`

Creates a token-based guard for ensuring only the most recent async operation is applied.

**Returns (`LatestTokenGuard`):**

| Method       | Signature                    | Description                                    |
| ------------ | ---------------------------- | ---------------------------------------------- |
| `issue`      | `() => number`               | Issues a new token, invalidating previous ones |
| `isCurrent`  | `(token: number) => boolean` | Checks if a token is still current             |
| `invalidate` | `() => void`                 | Invalidates the current token                  |
| `current`    | `() => number`               | Returns the current token value                |

---

### `runLatestPromise<A>(guard, task)`

Executes a task and checks staleness via the guard.

**Returns:** `Promise<LatestResult<A>>`

```ts
type LatestResult<A> = { readonly stale: false; readonly value: A } | { readonly stale: true };
```

**Example:**

```ts
const guard = createLatestTokenGuard();

const result = await runLatestPromise(guard, () => fetchData());
if (!result.stale) {
  applyData(result.value);
}
```

---

### `createCircuitBreaker(options)`

Creates a circuit breaker for fault tolerance and automatic recovery from repeated failures.

**Options:**

| Option             | Type     | Required | Description                                     |
| ------------------ | -------- | -------- | ----------------------------------------------- |
| `failureThreshold` | `number` | Yes      | Number of failures before opening the circuit   |
| `resetTimeout`     | `number` | Yes      | Milliseconds to wait before attempting recovery |

**Returns (`CircuitBreaker`):**

| Property/Method | Type                                                                        | Description                                   |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| `execute`       | `<A>(task: () => Promise<A>) => Promise<A>`                                 | Execute a task through the circuit breaker    |
| `executeEffect` | `<A, E, R>(effect: Effect<A, E, R>) => Effect<A, E \| CircuitOpenError, R>` | Execute an Effect through the circuit breaker |
| `state`         | `() => CircuitState`                                                        | Get current circuit state                     |
| `stats`         | `() => CircuitStats`                                                        | Get circuit statistics                        |
| `reset`         | `() => void`                                                                | Manually reset the circuit to closed state    |

**Circuit States:**

```ts
type CircuitState = "closed" | "open" | "half-open";
```

- `"closed"` -- Normal operation, requests pass through
- `"open"` -- Circuit is open, requests fail immediately with `CircuitOpenError`
- `"half-open"` -- Testing recovery, next request determines if circuit closes

**Example:**

```ts
const breaker = createCircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
});

try {
  const result = await breaker.execute(() => fetchData());
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log("Circuit is open, request blocked");
  }
}
```

---

### `CircuitOpenError`

Error thrown when the circuit breaker is in the open state and blocks requests.

| Property  | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `message` | `string` | Error message indicating circuit is open |

---

## Concurrency

### `withConcurrencyLimit(permits)`

Creates a concurrency-limited task runner (semaphore pattern).

| Parameter | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `permits` | `number` | Maximum concurrent tasks (positive integer) |

**Returns (`ConcurrencyRunner`):**

| Method    | Signature                                        | Description                        |
| --------- | ------------------------------------------------ | ---------------------------------- |
| `run`     | `<A>(task: () => A \| Promise<A>) => Promise<A>` | Run a task, queuing if at capacity |
| `active`  | `() => number`                                   | Number of currently running tasks  |
| `pending` | `() => number`                                   | Number of queued tasks             |
| `clear`   | `(reason?: string) => void`                      | Reject all pending tasks           |

---

### `createTaskQueue(options)`

Creates a bounded task queue with configurable overflow strategy.

**Options (`TaskQueueOptions`):**

| Option        | Type                    | Default          | Description                            |
| ------------- | ----------------------- | ---------------- | -------------------------------------- |
| `capacity`    | `number`                | **Required**     | Maximum total tasks (active + pending) |
| `concurrency` | `number`                | `1`              | Maximum concurrent tasks               |
| `overflow`    | `QueueOverflowStrategy` | `"backpressure"` | `"backpressure" \| "drop" \| "slide"`  |

**Returns (`TaskQueue`):**

| Method    | Signature                                        | Description              |
| --------- | ------------------------------------------------ | ------------------------ |
| `enqueue` | `<A>(task: () => A \| Promise<A>) => Promise<A>` | Enqueue a task           |
| `size`    | `() => number`                                   | Queue size               |
| `active`  | `() => number`                                   | Active task count        |
| `pending` | `() => number`                                   | Pending task count       |
| `clear`   | `(reason?: string) => void`                      | Cancel all pending tasks |

**Overflow strategies:**

- `"backpressure"` -- waits until capacity is available
- `"drop"` -- throws `QueueOverflowError` immediately
- `"slide"` -- drops the oldest pending task to make room

---

### `createRateLimitedRunner(options)`

Creates a runner that enforces rate limits using a sliding window.

**Options (`RateLimitedRunnerOptions`):**

| Option     | Type            | Description                     |
| ---------- | --------------- | ------------------------------- |
| `limit`    | `number`        | Maximum operations per interval |
| `interval` | `DurationInput` | Sliding window duration         |

**Returns (`RateLimitedRunner`):**

| Method    | Signature                                        | Description              |
| --------- | ------------------------------------------------ | ------------------------ |
| `run`     | `<A>(task: () => A \| Promise<A>) => Promise<A>` | Run rate-limited task    |
| `pending` | `() => number`                                   | Number of waiting tasks  |
| `clear`   | `(reason?: string) => void`                      | Cancel all waiting tasks |

---

### `useSemaphore(permits)`

React hook that provides a concurrency-limited runner scoped to the component lifecycle.

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `permits` | `number` | Maximum concurrent tasks |

**Returns (`UseSemaphoreResult`):**

| Method    | Signature                                        | Description                     |
| --------- | ------------------------------------------------ | ------------------------------- |
| `run`     | `<A>(task: () => A \| Promise<A>) => Promise<A>` | Run a task within the semaphore |
| `active`  | `() => number`                                   | Number of active tasks          |
| `pending` | `() => number`                                   | Number of pending tasks         |
| `clear`   | `(reason?: string) => void`                      | Cancel pending tasks            |

**Example:**

```tsx
const sem = useSemaphore(3);

const handleClick = async () => {
  const result = await sem.run(() => fetch("/api/data").then((r) => r.json()));
};
```

---

### Error Types

#### `QueueOverflowError`

Thrown when a task queue is full and the overflow strategy is `"drop"`.

#### `QueueCanceledError`

Thrown when a pending task is canceled via `clear()`.

---

## Policies

### `createDebouncePolicy(duration)`

Creates an execution policy that debounces calls. Only the last task submitted within the duration window executes.

| Parameter  | Type            | Description     |
| ---------- | --------------- | --------------- |
| `duration` | `DurationInput` | Debounce window |

**Returns (`ExecutionPolicy`):**

| Method    | Signature                                        | Description               |
| --------- | ------------------------------------------------ | ------------------------- |
| `run`     | `<A>(task: () => A \| Promise<A>) => Promise<A>` | Submit a task             |
| `cancel`  | `(reason?: string) => void`                      | Cancel pending task       |
| `pending` | `() => boolean`                                  | Whether a task is pending |

---

### `createThrottlePolicy(duration)`

Creates an execution policy that throttles calls. Executes the first call immediately, then one queued call per interval.

| Parameter  | Type            | Description     |
| ---------- | --------------- | --------------- |
| `duration` | `DurationInput` | Throttle window |

**Returns:** `ExecutionPolicy` (same interface as debounce)

---

### `useDebouncedRunner(duration)`

React hook that provides a debounced Effect runner scoped to the component lifecycle.

| Parameter  | Type            | Description     |
| ---------- | --------------- | --------------- |
| `duration` | `DurationInput` | Debounce window |

**Returns:**

| Property  | Type                                                                                 | Description               |
| --------- | ------------------------------------------------------------------------------------ | ------------------------- |
| `run`     | `<A, E, R>(effect: Effect<A, E, R> \| () => Effect<A, E, R>) => Promise<Exit<A, E>>` | Run debounced effect      |
| `cancel`  | `(reason?: string) => void`                                                          | Cancel pending execution  |
| `pending` | `() => boolean`                                                                      | Whether a task is pending |

**Example:**

```tsx
const debounced = useDebouncedRunner(300);

const handleSearch = (query: string) => {
  debounced.run(Effect.tryPromise(() => searchApi(query)));
};
```

---

### `useThrottledRunner(duration)`

React hook that provides a throttled Effect runner. Same return type as `useDebouncedRunner`.

---

### `PolicyCanceledError`

Error thrown when a debounced/throttled task is replaced or canceled.

---

## Scheduling

### `useScheduledEffect<A, E, R>(effect, schedule, enabled?)`

React hook that runs an Effect on a schedule (interval or timeout), managing cancellation on unmount.

| Parameter  | Type                                       | Default      | Description                  |
| ---------- | ------------------------------------------ | ------------ | ---------------------------- |
| `effect`   | `Effect<A, E, R> \| () => Effect<A, E, R>` | **Required** | The effect to execute        |
| `schedule` | `SchedulePolicy`                           | **Required** | Interval or timeout config   |
| `enabled`  | `boolean`                                  | `true`       | Whether scheduling is active |

**Returns:** `void`

---

### `useIntervalEffect<A, E, R>(effect, duration, enabled?)`

Convenience wrapper around `useScheduledEffect` for interval scheduling.

| Parameter  | Type                                       | Default      | Description                  |
| ---------- | ------------------------------------------ | ------------ | ---------------------------- |
| `effect`   | `Effect<A, E, R> \| () => Effect<A, E, R>` | **Required** | Effect to execute            |
| `duration` | `DurationInput`                            | **Required** | Interval duration            |
| `enabled`  | `boolean`                                  | `true`       | Whether scheduling is active |

**Example:**

```tsx
useIntervalEffect(
  Effect.sync(() => console.log("tick")),
  5000,
);
```

---

### `useTimeoutEffect<A, E, R>(effect, duration, enabled?)`

Convenience wrapper around `useScheduledEffect` for one-time delayed execution.

| Parameter  | Type                                       | Default      | Description                  |
| ---------- | ------------------------------------------ | ------------ | ---------------------------- |
| `effect`   | `Effect<A, E, R> \| () => Effect<A, E, R>` | **Required** | Effect to execute            |
| `duration` | `DurationInput`                            | **Required** | Delay before execution       |
| `enabled`  | `boolean`                                  | `true`       | Whether scheduling is active |

---

### `createScheduledRunner(schedule)`

Low-level factory for creating scheduled runners.

| Parameter  | Type             | Description                                                                                 |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `schedule` | `SchedulePolicy` | `{ kind: "interval", every: DurationInput }` or `{ kind: "timeout", after: DurationInput }` |

**Returns (`ScheduledRunner`):**

| Method      | Signature                       | Description                    |
| ----------- | ------------------------------- | ------------------------------ |
| `run`       | `(task: ScheduledTask) => void` | Start the schedule             |
| `cancel`    | `() => void`                    | Stop the schedule              |
| `isRunning` | `() => boolean`                 | Whether the schedule is active |

---

### Types

```ts
type ScheduledTask<A = void> = () => A | Promise<A>;

type SchedulePolicy =
  | { readonly kind: "interval"; readonly every: DurationInput }
  | { readonly kind: "timeout"; readonly after: DurationInput };
```

---

## Streams

### `usePollingStream<T>(options)`

React hook for polling data at a regular interval with automatic retry and backoff.

**Options (`UsePollingStreamOptions<T>`):**

| Option      | Type                                 | Default                                  | Description                                    |
| ----------- | ------------------------------------ | ---------------------------------------- | ---------------------------------------------- |
| `interval`  | `DurationInput`                      | **Required**                             | Polling interval                               |
| `fetcher`   | `() => T \| Promise<T> \| Effect<T>` | **Required**                             | Data fetcher (supports sync, async, or Effect) |
| `enabled`   | `boolean`                            | `true`                                   | Enable/disable polling                         |
| `immediate` | `boolean`                            | `true`                                   | Fetch immediately on mount                     |
| `retry`     | `boolean`                            | `true`                                   | Auto-retry on failure                          |
| `backoff`   | `BackoffPolicy`                      | `{ initial: 250, max: 5000, factor: 2 }` | Backoff config for retries                     |
| `onMessage` | `(value: T) => void`                 | **Required**                             | Called with each poll result                   |
| `onError`   | `(error: unknown) => void`           | -                                        | Called on fetch error                          |

**Returns:** `void`

**Example:**

```tsx
usePollingStream({
  interval: 10_000,
  fetcher: () => fetch("/api/status").then((r) => r.json()),
  onMessage: (status) => setStatus(status),
});
```

---

### `useEventSourceStream<T>(options)`

React hook for consuming Server-Sent Events with automatic reconnection.

**Options (`UseEventSourceStreamOptions<T>`):**

| Option            | Type                       | Default                                  | Description                       |
| ----------------- | -------------------------- | ---------------------------------------- | --------------------------------- |
| `url`             | `string`                   | **Required**                             | SSE endpoint URL                  |
| `enabled`         | `boolean`                  | `true`                                   | Enable/disable the connection     |
| `reconnect`       | `boolean`                  | `true`                                   | Auto-reconnect on error           |
| `backoff`         | `BackoffPolicy`            | `{ initial: 250, max: 5000, factor: 2 }` | Reconnection backoff              |
| `withCredentials` | `boolean`                  | -                                        | Pass credentials with the request |
| `parse`           | `(value: string) => T`     | -                                        | Parse incoming messages           |
| `onMessage`       | `(value: T) => void`       | **Required**                             | Message handler                   |
| `onOpen`          | `() => void`               | -                                        | Connection opened handler         |
| `onError`         | `(error: unknown) => void` | -                                        | Error handler                     |

**Returns:** `void`

**Example:**

```tsx
useEventSourceStream({
  url: "/api/events",
  parse: JSON.parse,
  onMessage: (event) => dispatch(event),
});
```

---

### `useWebSocketStream<T>(options)`

React hook for WebSocket connections with automatic reconnection and send capability.

**Options (`UseWebSocketStreamOptions<T>`):**

| Option      | Type                          | Default                                  | Description                   |
| ----------- | ----------------------------- | ---------------------------------------- | ----------------------------- |
| `url`       | `string`                      | **Required**                             | WebSocket URL                 |
| `enabled`   | `boolean`                     | `true`                                   | Enable/disable the connection |
| `reconnect` | `boolean`                     | `true`                                   | Auto-reconnect on close       |
| `backoff`   | `BackoffPolicy`               | `{ initial: 250, max: 5000, factor: 2 }` | Reconnection backoff          |
| `parse`     | `(value: string) => T`        | -                                        | Parse incoming messages       |
| `onMessage` | `(value: T) => void`          | **Required**                             | Message handler               |
| `onOpen`    | `() => void`                  | -                                        | Connection opened handler     |
| `onClose`   | `(event: CloseEvent) => void` | -                                        | Connection closed handler     |
| `onError`   | `(error: unknown) => void`    | -                                        | Error handler                 |

**Returns (`UseWebSocketStreamResult`):**

| Property    | Type                         | Description                                      |
| ----------- | ---------------------------- | ------------------------------------------------ |
| `connected` | `boolean`                    | Whether the WebSocket is currently open          |
| `send`      | `(value: string) => boolean` | Send a message. Returns `false` if not connected |

**Example:**

```tsx
const { connected, send } = useWebSocketStream({
  url: "wss://api.example.com/ws",
  parse: JSON.parse,
  onMessage: (msg) => handleMessage(msg),
});
```

---

### `BackoffPolicy`

| Property  | Type            | Default | Description               |
| --------- | --------------- | ------- | ------------------------- |
| `initial` | `DurationInput` | `250`   | Initial backoff delay     |
| `max`     | `DurationInput` | `5000`  | Maximum backoff delay     |
| `factor`  | `number`        | `2`     | Exponential growth factor |

---

## Browser

### `createClipboardSource(options?)`

Creates a headless clipboard source for reading/writing clipboard content.

**Options:**

| Option      | Type                                         | Description          |
| ----------- | -------------------------------------------- | -------------------- |
| `clipboard` | `Pick<Clipboard, "readText" \| "writeText">` | Custom clipboard API |

**Returns (`ClipboardSource`):**

| Method        | Signature                          | Description             |
| ------------- | ---------------------------------- | ----------------------- |
| `getSnapshot` | `() => ClipboardSnapshot`          | Current state           |
| `subscribe`   | `(listener) => () => void`         | Subscribe to changes    |
| `refresh`     | `() => Promise<ClipboardSnapshot>` | Refresh snapshot        |
| `read`        | `() => Promise<string>`            | Read clipboard text     |
| `write`       | `(value: string) => Promise<void>` | Write text to clipboard |

```ts
interface ClipboardSnapshot {
  readonly text: string | null;
  readonly error: Error | null;
}
```

---

### `createGeolocationSource(options?)`

Creates a headless geolocation source.

**Options:**

| Option            | Type              | Description              |
| ----------------- | ----------------- | ------------------------ |
| `geolocation`     | `Geolocation`     | Custom geolocation API   |
| `positionOptions` | `PositionOptions` | Accuracy/timeout options |

**Returns (`GeolocationSource`):**

| Method        | Signature                            | Description                               |
| ------------- | ------------------------------------ | ----------------------------------------- |
| `getSnapshot` | `() => GeolocationSnapshot`          | Current state                             |
| `subscribe`   | `(listener) => () => void`           | Subscribe to changes                      |
| `refresh`     | `() => Promise<GeolocationSnapshot>` | Get current position                      |
| `start`       | `() => () => void`                   | Start watching position (returns cleanup) |

```ts
interface GeolocationSnapshot {
  readonly position: GeolocationPosition | null;
  readonly error: Error | null;
}
```

---

### `createPermissionsSource(options?)`

Creates a headless permissions source for querying and tracking browser permissions.

**Options:**

| Option        | Type                         | Description            |
| ------------- | ---------------------------- | ---------------------- |
| `permissions` | `Pick<Permissions, "query">` | Custom permissions API |

**Returns (`PermissionsSource`):**

| Method        | Signature                                            | Description          |
| ------------- | ---------------------------------------------------- | -------------------- |
| `getSnapshot` | `() => PermissionStateSnapshot`                      | Current state        |
| `subscribe`   | `(listener) => () => void`                           | Subscribe to changes |
| `refresh`     | `() => Promise<PermissionStateSnapshot>`             | Refresh snapshot     |
| `query`       | `(name: PermissionName) => Promise<PermissionState>` | Query a permission   |

```ts
interface PermissionStateSnapshot {
  readonly states: Readonly<Record<string, PermissionState>>;
  readonly error: Error | null;
}
```

---

### `createNetworkStatusSource(options?)`

Creates a headless source tracking online/offline status.

**Options:**

| Option   | Type     | Description             |
| -------- | -------- | ----------------------- |
| `target` | `Window` | Custom window reference |

**Returns (`NetworkStatusSource`):**

| Method        | Signature                              | Description          |
| ------------- | -------------------------------------- | -------------------- |
| `getSnapshot` | `() => NetworkStatusSnapshot`          | Current state        |
| `subscribe`   | `(listener) => () => void`             | Subscribe to changes |
| `refresh`     | `() => Promise<NetworkStatusSnapshot>` | Refresh snapshot     |

```ts
interface NetworkStatusSnapshot {
  readonly online: boolean;
}
```

---

### `createVisibilitySource(options?)`

Creates a headless source tracking document visibility state.

**Options:**

| Option   | Type       | Description               |
| -------- | ---------- | ------------------------- |
| `target` | `Document` | Custom document reference |

**Returns (`VisibilitySource`):**

| Method        | Signature                           | Description          |
| ------------- | ----------------------------------- | -------------------- |
| `getSnapshot` | `() => VisibilitySnapshot`          | Current state        |
| `subscribe`   | `(listener) => () => void`          | Subscribe to changes |
| `refresh`     | `() => Promise<VisibilitySnapshot>` | Refresh snapshot     |

```ts
interface VisibilitySnapshot {
  readonly visibilityState: DocumentVisibilityState;
}
```

---

### `HeadlessSource<T>`

Base interface for all browser sources. Compatible with `useSyncExternalStore`.

```ts
interface HeadlessSource<T> {
  readonly getSnapshot: () => T;
  readonly subscribe: (listener: StoreListener) => () => void;
  readonly refresh: () => Promise<T>;
}
```

---

## Error Boundary

### `EffectErrorBoundary`

React error boundary component with Effect-aware error classification. Automatically classifies errors into interruptions, failures, and defects (from `SuspenseQueryError`).

**Props (`EffectErrorBoundaryProps`):**

| Prop                   | Type                       | Required | Description                      |
| ---------------------- | -------------------------- | -------- | -------------------------------- |
| `children`             | `ReactNode`                | Yes      | Content to render                |
| `fallback`             | `EffectBoundaryFallback`   | No       | Default fallback for any error   |
| `interruptionFallback` | `EffectBoundaryFallback`   | No       | Fallback for interrupted effects |
| `failureFallback`      | `EffectBoundaryFallback`   | No       | Fallback for expected failures   |
| `defectFallback`       | `EffectBoundaryFallback`   | No       | Fallback for unexpected defects  |
| `resetKeys`            | `readonly unknown[]`       | No       | Reset boundary when keys change  |
| `onError`              | `(error: unknown) => void` | No       | Error callback                   |
| `onReset`              | `() => void`               | No       | Reset callback                   |

**`EffectBoundaryFallback`:**

```ts
type EffectBoundaryFallback = ReactNode | ((props: EffectBoundaryFallbackProps) => ReactNode);

interface EffectBoundaryFallbackProps {
  readonly error: unknown;
  readonly kind: "interruption" | "failure" | "defect";
  readonly reset: () => void;
}
```

**Example:**

```tsx
<EffectErrorBoundary
  failureFallback={({ error, reset }) => (
    <div>
      <p>Something went wrong</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
  defectFallback={<p>An unexpected error occurred</p>}
>
  <Suspense fallback={<Loading />}>
    <UserProfile />
  </Suspense>
</EffectErrorBoundary>
```

---

## Schema → Use effect/Schema

Effect provides a full schema/validation system. See [Schema docs](https://effect.website/docs/schema/introduction).

---

## Result → Use Effect's Either / Exit

Effect provides `Either` (success/failure), `Exit` (with Cause), and `Option`. See [Either docs](https://effect.website/docs/data-types/either).

---

## Events

### `createEventChannel<Events>()`

Creates a typed, synchronous pub/sub event channel.

**Type parameter:** `Events` -- an object type mapping event names to payload types.

**Returns (`EventChannel<Events>`):**

| Method          | Signature                                                            | Description                              |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `publish`       | `<K>(type: K, payload: Events[K]) => void`                           | Emit an event synchronously              |
| `publishEffect` | `<K>(type: K, payload: Events[K]) => Effect<void>`                   | Emit an event as an Effect               |
| `subscribe`     | `<K>(type: K, listener: (payload: Events[K]) => void) => () => void` | Subscribe to a specific event type       |
| `subscribeAll`  | `(listener: (event: EventEnvelope<Events>) => void) => () => void`   | Subscribe to all events                  |
| `once`          | `<K>(type: K) => Promise<Events[K]>`                                 | Wait for the next occurrence of an event |
| `nextEffect`    | `<K>(type: K) => Effect<Events[K]>`                                  | Wait for the next event as an Effect     |
| `clear`         | `(type?: keyof Events) => void`                                      | Remove listeners for a type or all       |
| `listenerCount` | `(type?: keyof Events) => number`                                    | Count active listeners                   |

```ts
type EventEnvelope<Events> = {
  [K in keyof Events]: { readonly type: K; readonly payload: Events[K] };
}[keyof Events];
```

**Example:**

```ts
type AppEvents = {
  userLoggedIn: { userId: string };
  notification: { message: string };
};

const channel = createEventChannel<AppEvents>();

const unsub = channel.subscribe("userLoggedIn", ({ userId }) => {
  console.log("User logged in:", userId);
});

channel.publish("userLoggedIn", { userId: "123" });

unsub();
```

---

## Optimistic

### `createOptimisticQueue<S>(initialState)`

Creates an optimistic update queue that tracks pending mutations with rollback support.

| Parameter      | Type | Description   |
| -------------- | ---- | ------------- |
| `initialState` | `S`  | Initial state |

**Returns (`OptimisticQueue<S>`):**

| Method       | Signature                 | Description                                |
| ------------ | ------------------------- | ------------------------------------------ |
| `getState`   | `() => S`                 | Get current (optimistically updated) state |
| `setState`   | `(state: S) => void`      | Set state directly                         |
| `pendingIds` | `() => readonly string[]` | List IDs of pending mutations              |

---

### `enqueueOptimisticMutation<S, A>(queue, mutation)`

Adds an optimistic mutation to the queue. Immediately applies the optimistic state.

**Mutation (`OptimisticMutation<S, A>`):**

| Property   | Type                    | Required | Description                                    |
| ---------- | ----------------------- | -------- | ---------------------------------------------- |
| `id`       | `string`                | No       | Custom mutation ID (auto-generated if omitted) |
| `apply`    | `(state: S) => S`       | Yes      | Optimistic state transform                     |
| `rollback` | `(state: S) => S`       | Yes      | Rollback transform on failure                  |
| `execute`  | `() => A \| Promise<A>` | Yes      | The actual async mutation                      |

**Returns:** `string` -- the mutation ID

---

### `rollbackOptimisticMutation<S>(queue, id)`

Rolls back a specific mutation and removes it from the queue.

**Returns:** `boolean` -- `true` if the mutation was found and rolled back

---

### `replayPendingMutations<S>(queue, options?)`

Executes all pending mutations in order. On failure, rolls back the failed mutation.

**Options (`ReplayOptions`):**

| Option            | Type      | Default | Description                        |
| ----------------- | --------- | ------- | ---------------------------------- |
| `continueOnError` | `boolean` | `false` | Continue replaying after a failure |

**Returns:** `Promise<ReplayResult>`

```ts
interface ReplayResult {
  readonly completed: readonly string[];
  readonly failed: readonly string[];
}
```

**Example:**

```ts
const queue = createOptimisticQueue({ items: [] as string[] });

const id = enqueueOptimisticMutation(queue, {
  apply: (state) => ({ items: [...state.items, "new-item"] }),
  rollback: (state) => ({ items: state.items.filter((i) => i !== "new-item") }),
  execute: () => api.addItem("new-item"),
});

// State is optimistically updated immediately
console.log(queue.getState()); // { items: ["new-item"] }

// On failure, roll back
rollbackOptimisticMutation(queue, id);
```

---

## Persistence

### `createPersistenceStore<A>(options)`

Creates a typed persistence store backed by any storage adapter.

**Options (`CreatePersistenceStoreOptions<A>`):**

| Option    | Type                  | Required | Description                          |
| --------- | --------------------- | -------- | ------------------------------------ |
| `key`     | `string`              | Yes      | Storage key                          |
| `storage` | `PersistenceStorage`  | Yes      | Storage adapter                      |
| `codec`   | `PersistenceCodec<A>` | No       | Custom serialization (default: JSON) |

**Returns (`PersistenceStore<A>`):**

| Property/Method | Type                            | Description            |
| --------------- | ------------------------------- | ---------------------- |
| `key`           | `string`                        | The storage key        |
| `save`          | `(value: A) => Promise<void>`   | Persist a value        |
| `load`          | `() => Promise<A \| undefined>` | Load persisted value   |
| `clear`         | `() => Promise<void>`           | Remove persisted value |

---

### `createMemoryStorage()`

Creates an in-memory storage adapter (useful for testing).

**Returns (`MemoryStorage`):**

| Method       | Signature                              | Description      |
| ------------ | -------------------------------------- | ---------------- |
| `getItem`    | `(key: string) => string \| null`      | Get item         |
| `setItem`    | `(key: string, value: string) => void` | Set item         |
| `removeItem` | `(key: string) => void`                | Remove item      |
| `entries`    | `() => readonly [string, string][]`    | List all entries |

---

### `persistQueryState(cache, store)`

Dehydrates the query cache and saves it to a persistence store.

| Parameter | Type                                | Description                |
| --------- | ----------------------------------- | -------------------------- |
| `cache`   | `QueryCache`                        | The query cache to persist |
| `store`   | `PersistenceStore<DehydratedState>` | Destination store          |

**Returns:** `Promise<void>`

---

### `hydrateQueryState(cache, store)`

Loads dehydrated state from a persistence store and hydrates the query cache.

**Returns:** `Promise<boolean>` -- `true` if state was found and loaded

---

### `persistSubscriptionState<A>(store, state)`

Persists arbitrary state (e.g., from a SubscriptionRef) to a store.

| Parameter | Type                  | Description            |
| --------- | --------------------- | ---------------------- |
| `store`   | `PersistenceStore<A>` | Destination store      |
| `state`   | `A \| (() => A)`      | Value or value factory |

**Returns:** `Promise<void>`

---

### `hydratePersistedSnapshot<A>(store)`

Loads a persisted snapshot.

**Returns:** `Promise<A | undefined>`

---

### Interfaces

```ts
interface PersistenceStorage {
  readonly getItem: (key: string) => string | null | Promise<string | null>;
  readonly setItem: (key: string, value: string) => void | Promise<void>;
  readonly removeItem: (key: string) => void | Promise<void>;
}

interface PersistenceCodec<A> {
  readonly encode: (value: A) => string;
  readonly decode: (encoded: string) => A;
}
```

**Example:**

```ts
const store = createPersistenceStore({
  key: "app-cache",
  storage: localStorage,
});

await persistQueryState(cache, store);
// ... later
await hydrateQueryState(cache, store);
```

---

## SSR

The `ssr` module is exported as a namespace: `import { ssr } from "@rika-labs/effect-react"`.

### `ssr.dehydrate(cache)`

Serializes the query cache into a `DehydratedState` for server-side rendering.

| Parameter | Type         | Description     |
| --------- | ------------ | --------------- |
| `cache`   | `QueryCache` | The query cache |

**Returns:** `DehydratedState`

---

### `ssr.hydrate(cache, state)`

Restores dehydrated state into the query cache on the client.

| Parameter | Type              | Description              |
| --------- | ----------------- | ------------------------ |
| `cache`   | `QueryCache`      | The query cache          |
| `state`   | `DehydratedState` | State from `dehydrate()` |

**Example:**

```tsx
// Server
const cache = new QueryCache();
await cache.prefetch({ key: ["users"], query: fetchUsers, runtime });
const dehydratedState = ssr.dehydrate(cache);

// Client
const cache = new QueryCache();
ssr.hydrate(cache, dehydratedState);
```

---

### `ssr.dehydrateFrameworkState(options)` / `ssr.hydrateFrameworkState(options)`

Framework hydration protocol helpers that combine query dehydration with router loader snapshot state.

`dehydrateFrameworkState` options:

| Option        | Type                  | Required | Description                    |
| ------------- | --------------------- | -------- | ------------------------------ |
| `cache`       | `QueryCache`          | Yes      | Query cache to serialize       |
| `loaderState` | `RouteLoaderSnapshot` | No       | Optional route loader snapshot |

`hydrateFrameworkState` options:

| Option  | Type                      | Required | Description               |
| ------- | ------------------------- | -------- | ------------------------- |
| `cache` | `QueryCache`              | Yes      | Query cache to hydrate    |
| `state` | `FrameworkHydrationState` | Yes      | Framework hydration state |

**Returns:**

- `dehydrateFrameworkState` => `FrameworkHydrationState`
- `hydrateFrameworkState` => `RouteLoaderSnapshot`

---

### `ssr.createFrameworkHydrationScript(state, globalName?)`

Creates a browser-safe inline hydration script payload for framework state.

| Parameter    | Type                      | Description                                             |
| ------------ | ------------------------- | ------------------------------------------------------- |
| `state`      | `FrameworkHydrationState` | Framework hydration state                               |
| `globalName` | `string`                  | Optional global name (default `__EFFECT_REACT_STATE__`) |

---

### `ssr.parseFrameworkHydrationState(text)`

Parses serialized framework hydration state and validates envelope shape.

**Returns:** `FrameworkHydrationState | undefined`

---

### `createServerHydrationScript(options)` (server module)

Server-side helper that combines query + route-loader state and returns a script assignment string.

| Option        | Type                  | Required | Description                       |
| ------------- | --------------------- | -------- | --------------------------------- |
| `cache`       | `QueryCache`          | Yes      | Query cache to serialize          |
| `loaderState` | `RouteLoaderSnapshot` | No       | Optional route loader snapshot    |
| `globalName`  | `string`              | No       | Optional global variable override |

**Returns:** `string`

---

## Framework + CLI

### `effectReactVitePlugin(options?)`

Vite plugin that discovers route and action modules and exposes:

- `virtual:effect-react/routes`
- `virtual:effect-react/actions`

### `defineApp(options)`

Composes runtime routes/actions/loaders and returns:

- `router`
- `createServerHandler()`
- `createActionTransport()`
- `createSsrHandler()`

### `defineAppFromManifest(options)`

Builds an app from discovered action manifests.

### `defineAppFromManifests(options)`

Builds an app from discovered route + action manifests.

### `createSsrHandler(options)`

Framework SSR request pipeline:

1. Match route chain
2. Run loaders
3. Render React element from Effect
4. Inject framework hydration payload into HTML/stream response

### CLI commands

- `effect-react new <name>`
- `effect-react dev`
- `effect-react build`
- `effect-react start`

---

## Devtools

### `snapshotQueryCache(cache)`

Takes a diagnostic snapshot of the query cache.

| Parameter | Type         | Description                |
| --------- | ------------ | -------------------------- |
| `cache`   | `QueryCache` | The query cache to inspect |

**Returns:** `QueryCacheDiagnosticsSnapshot`

```ts
interface QueryCacheDiagnosticsSnapshot {
  readonly size: number;
  readonly entries: readonly QueryCacheEntryDiagnostics[];
}

interface QueryCacheEntryDiagnostics {
  readonly key: QueryKey;
  readonly hash: string;
  readonly status: QueryStatus;
  readonly subscribers: number;
  readonly inFlight: boolean;
  readonly hasData: boolean;
  readonly isStale: boolean;
  readonly updatedAt: number | null;
}
```

---

### `summarizeQueryDiagnostics(snapshot)`

Produces a summary from a diagnostics snapshot.

| Parameter  | Type                            | Description           |
| ---------- | ------------------------------- | --------------------- |
| `snapshot` | `QueryCacheDiagnosticsSnapshot` | Snapshot to summarize |

**Returns (`QueryDiagnosticsSummary`):**

| Property      | Type     | Description                          |
| ------------- | -------- | ------------------------------------ |
| `total`       | `number` | Total cache entries                  |
| `stale`       | `number` | Number of stale entries              |
| `loading`     | `number` | Number of loading/refreshing entries |
| `failure`     | `number` | Number of failed entries             |
| `subscribers` | `number` | Total active subscribers             |
| `inFlight`    | `number` | Number of in-flight requests         |

**Example:**

```ts
const snapshot = snapshotQueryCache(cache);
const summary = summarizeQueryDiagnostics(snapshot);
console.log(`Cache: ${summary.total} entries, ${summary.stale} stale`);
```

---

## Full-Stack Framework APIs

### `defineAppFromManifest(options)`

Builds an app using server action entries discovered from a manifest module (for example, the Vite virtual actions module).

| Option           | Type                         | Description                           |
| ---------------- | ---------------------------- | ------------------------------------- |
| `manifestModule` | `ServerActionManifestModule` | Module with `actionManifest` + loader |
| `runtime`        | `AnyManagedRuntime`          | Effect runtime                        |
| `routes`         | `readonly AnyRoute[]`        | Route definitions                     |
| `history`        | `RouterHistory`              | Optional custom history               |
| `handlers`       | `readonly RouteHandler[]`    | Optional route handlers               |
| `loaders`        | `readonly AnyRouteLoader[]`  | Optional app loaders                  |
| `middlewares`    | `readonly RouteMiddleware[]` | Optional route middlewares            |

**Returns:** `Effect<EffectApp<...>, Error, never>`

---

### `defineAppFromManifests(options)`

Builds an app from both route and server-action manifests.

| Option                 | Type                         | Description                                         |
| ---------------------- | ---------------------------- | --------------------------------------------------- |
| `runtime`              | `AnyManagedRuntime`          | Effect runtime                                      |
| `actionManifestModule` | `ServerActionManifestModule` | Module with discovered server actions               |
| `routeManifestModule`  | `RouteManifestModule`        | Module with discovered routes + route module loader |
| `handlers`             | `readonly RouteHandler[]`    | Optional route handlers                             |
| `loaders`              | `readonly AnyRouteLoader[]`  | Optional explicit loaders (override same route ids) |
| `middlewares`          | `readonly RouteMiddleware[]` | Optional route middlewares                          |
| `history`              | `RouterHistory`              | Optional custom history                             |
| `actionBasePath`       | `string`                     | Optional server action base path                    |

**Returns:** `Effect<EffectApp<readonly AnyRoute[], readonly AnyServerAction[]>, ManifestAppError, never>`

---

### `effectReactVitePlugin(options?)`

Vite plugin that provides framework virtual modules and server-action call transforms.

Virtual module IDs:

- `virtual:effect-react/routes`
- `virtual:effect-react/actions`

---

### `createRouteRequestHandlerEffect(runtime, handlers, options?)`

Effect-native route handler pipeline. Returns a function that maps `Request -> Effect<Response, never, never>`.

Use `createRouteRequestHandler(...)` when you need a Promise boundary adapter.

---

### `createServerActionHttpHandlerEffect(options)` / `createRequestScopedServerActionHttpHandlerEffect(options)`

Effect-native server-action HTTP handlers. They return `Request -> Effect<Response, never, never>`.

Use `createServerActionHttpHandler(...)` or `createRequestScopedServerActionHttpHandler(...)` for Promise-boundary adapters.

---

### `createRequestPipeline(options)`

Unified full-stack request pipeline with both Effect-native and Promise interfaces.

`RequestPipeline` includes:

- `handleEffect(request)` -> `Effect<Response, never, never>`
- `handle(request)` -> `Promise<Response>`
- `actionBasePath` -> normalized action endpoint prefix

---

### `createServerHydrationScript(options)`

Server helper that serializes framework hydration payload (query state + route loader snapshot) to an inline browser script assignment.

| Option        | Type                  | Required | Description                    |
| ------------- | --------------------- | -------- | ------------------------------ |
| `cache`       | `QueryCache`          | Yes      | Query cache to serialize       |
| `loaderState` | `RouteLoaderSnapshot` | No       | Route loader snapshot          |
| `globalName`  | `string`              | No       | Override global state variable |

**Returns:** `string`

---

### Router Loader Hooks

- `useRouteLoadersPending()` -> `boolean`
- `useRouteLoaderState(route)` -> `RouteLoaderSnapshotEntry | undefined`
- `useRevalidateRouteLoaders()` -> `() => Promise<void>`

These hooks expose loader lifecycle state and revalidation controls from router snapshots.

---

## Internal Utilities

These are exported from the root for advanced use cases.

### `DurationInput`

Re-exported from Effect. Accepts `number` (milliseconds), `string` (`"5 seconds"`), or `Duration` instances.

### `toMillis(input: DurationInput)`

Converts a `DurationInput` to milliseconds.

### `toDuration(input: DurationInput)`

Converts a `DurationInput` to an Effect `Duration`.

### `addDuration(startMs, input)`

Adds a duration to a timestamp.

### `isExpired(expiresAtMs, nowMs?)`

Returns `true` if the given timestamp has passed.

---

### `runEffect<A, E, R>(runtime, effect)`

Runs an Effect on the given runtime and returns a cancellable handle.

**Returns (`EffectRunHandle<A, E>`):**

| Property  | Type                  | Description               |
| --------- | --------------------- | ------------------------- |
| `promise` | `Promise<Exit<A, E>>` | The exit promise          |
| `signal`  | `AbortSignal`         | The abort signal          |
| `cancel`  | `() => void`          | Cancel the running effect |

---

### `createExternalStore<T>(initialSnapshot)`

Creates a minimal external store compatible with `useSyncExternalStore`.

**Returns (`ExternalStore<T>`):**

| Method          | Signature                  | Description                             |
| --------------- | -------------------------- | --------------------------------------- |
| `getSnapshot`   | `() => T`                  | Get current value                       |
| `subscribe`     | `(listener) => () => void` | Subscribe to changes                    |
| `setSnapshot`   | `(value: T) => void`       | Update value and notify listeners       |
| `notify`        | `() => void`               | Notify listeners without changing value |
| `listenerCount` | `() => number`             | Count active listeners                  |

---

### `hashQueryKey(key: readonly unknown[])`

Default query key hasher. Produces a deterministic string hash supporting strings, numbers, booleans, null, undefined, bigint, Date, plain objects, and arrays. Detects cycles and rejects functions/symbols.

**Returns:** `string`

---

### `invariant(condition, message)`

Throws if the condition is false. TypeScript narrows the type via `asserts condition`.

### `unreachable(value: never)`

Utility for exhaustiveness checks. Always throws.

---

### `KeyHasher`

```ts
type KeyHasher = (key: readonly unknown[]) => string;
```
