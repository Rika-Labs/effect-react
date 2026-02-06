# @effect-react/react

**One library. No glue code. Just Effect + React.**

`@effect-react/react` replaces your scattered stack of query libraries, state managers, form handlers, retry utilities, and validation layers with a single, Effect-native integration for React.

---

## What It Replaces

| You Currently Use                    | This Library Provides                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `@tanstack/react-query`, `swr`       | `useQuery`, `useSuspenseQuery`, `QueryCache`                                    |
| `zustand`, `jotai`                   | `useSubscriptionRef`, `useLocalSubscriptionRef`                                 |
| `react-hook-form`, `formik`          | `useForm` with Effect-native submit                                             |
| `p-limit`, `p-queue`, `p-throttle`   | `useSemaphore`, `createTaskQueue`, `createRateLimitedRunner`                    |
| `lodash.debounce`, `lodash.throttle` | `useDebouncedRunner`, `useThrottledRunner`                                      |
| `rxjs` (subset)                      | `usePollingStream`, `useEventSourceStream`, `useWebSocketStream`                |
| `mitt`, `eventemitter3`              | `createEventChannel`                                                            |
| `react-use` browser hooks            | `createClipboardSource`, `createGeolocationSource`, `createNetworkStatusSource` |

---

## Install

```bash
npm install @effect-react/react effect react react-dom
```

```bash
bun add @effect-react/react effect react react-dom
```

Peer dependencies: `effect@^3.19`, `react@^19`, `react-dom@^19`.

---

## Quick Start

### 1. Create a runtime and wrap your app

```tsx
import { ManagedRuntime, Layer } from "effect";
import { EffectProvider } from "@effect-react/react";

const AppRuntime = ManagedRuntime.make(Layer.empty);

function App() {
  return (
    <EffectProvider runtime={AppRuntime}>
      <YourApp />
    </EffectProvider>
  );
}
```

### 2. Fetch data with `useQuery`

```tsx
import { Effect } from "effect";
import { useQuery } from "@effect-react/react";

const fetchUsers = Effect.tryPromise({
  try: () => fetch("/api/users").then((r) => r.json() as Promise<User[]>),
  catch: () => new FetchError(),
});

function UserList() {
  const { data, status, refetch } = useQuery({
    key: ["users"],
    query: fetchUsers,
    staleTime: "30 seconds",
  });

  if (status === "loading") return <p>Loading...</p>;
  if (status === "failure") return <p>Error loading users</p>;

  return (
    <ul>
      {data?.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

### 3. Mutate with automatic cache invalidation

```tsx
import { useMutation } from "@effect-react/react";

function CreateUser() {
  const { mutate, status } = useMutation({
    mutation: (name: string) =>
      Effect.tryPromise(() =>
        fetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ name }),
        }),
      ),
    invalidate: [["users"]],
  });

  return (
    <button onClick={() => mutate("Alice")} disabled={status === "pending"}>
      Create User
    </button>
  );
}
```

---

## Features

### Provider

Wraps your app with an Effect `ManagedRuntime` and an optional `QueryCache`. All hooks resolve the runtime from context.

```tsx
import { EffectProvider, useRuntime } from "@effect-react/react";

<EffectProvider runtime={AppRuntime} cache={myCache}>
  {children}
</EffectProvider>;

// Access the runtime anywhere
const runtime = useRuntime();
```

### Query

Full query lifecycle: caching, stale-time, GC, refetch-on-focus, refetch-on-reconnect, select/transform, placeholder data, and `keepPreviousData`.

```tsx
const { data, status, cause, isStale, refetch, invalidate } = useQuery({
  key: ["todo", id],
  query: () => fetchTodo(id),
  enabled: id !== undefined,
  staleTime: "1 minute",
  gcTime: "5 minutes",
  select: (todo) => todo.title,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
```

**Suspense mode:**

```tsx
import { useSuspenseQuery } from "@effect-react/react";

function TodoTitle({ id }: { id: string }) {
  const { data } = useSuspenseQuery({
    key: ["todo", id],
    query: () => fetchTodo(id),
  });

  return <h1>{data.title}</h1>; // data is always defined
}
```

### Mutation

Mutations with lifecycle callbacks, automatic query invalidation, fiber cancellation on unmount, and optimistic update integration.

```tsx
const { mutate, cancel, reset, status, data, cause } = useMutation({
  mutation: (vars: CreateTodoInput) => createTodoEffect(vars),
  invalidate: [["todos"]],
  optimistic: {
    apply: (vars) => {
      /* optimistically update UI */
    },
    rollback: (vars, cause) => {
      /* revert on failure */
    },
  },
  onSuccess: (data, vars) => {
    /* ... */
  },
  onError: (cause, vars) => {
    /* ... */
  },
  onSettled: (result, vars) => {
    /* ... */
  },
});
```

### Forms

Effect-native form management with field registration, per-field and whole-form validation, dirty tracking, and fiber-based submit cancellation.

```tsx
import { useForm } from "@effect-react/react";

const { values, errors, dirty, isSubmitting, register, submit, reset } = useForm({
  initialValues: { email: "", password: "" },
  validate: (values) => {
    const errors: Partial<Record<string, string>> = {};
    if (!values.email) errors.email = "Required";
    return errors;
  },
  onSubmit: (values) =>
    Effect.tryPromise(() => fetch("/api/login", { method: "POST", body: JSON.stringify(values) })),
});

const email = register("email");
// email.name, email.value, email.error, email.touched, email.onChange, email.onBlur
```

### State

Reactive state powered by Effect `SubscriptionRef`. Changes propagate through Effect streams, and `useDerived` provides selector-based derived values with referential stability.

```tsx
import { useSubscriptionRef, useLocalSubscriptionRef, useDerived } from "@effect-react/react";

// Bind to an existing SubscriptionRef from your Effect layer
const { value, set, update } = useSubscriptionRef({
  ref: myCounterRef,
  initial: 0,
});

// Create a component-scoped SubscriptionRef automatically
const { value, ready, set, update } = useLocalSubscriptionRef({
  initial: { count: 0 },
});

// Derive a stable value from any source
const doubled = useDerived(value, (v) => v.count * 2);
```

### HTTP → Use @effect/platform

Effect provides a full HTTP client via `@effect/platform`. See the [HttpClient docs](https://effect.website/docs/platform/http-client).

```ts
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { FetchHttpClient } from "@effect/platform";
```

### Streams

Reactive data streams for polling, SSE, and WebSockets with automatic reconnection and backoff.

```tsx
import { usePollingStream, useEventSourceStream, useWebSocketStream } from "@effect-react/react";

// Polling
usePollingStream({
  interval: "5 seconds",
  fetcher: () => Effect.tryPromise(() => fetch("/api/status").then((r) => r.json())),
  onMessage: (data) => setStatus(data),
  retry: true,
  backoff: { initial: 250, max: 5000, factor: 2 },
});

// Server-Sent Events
useEventSourceStream({
  url: "/api/events",
  parse: (data) => JSON.parse(data) as Event,
  onMessage: (event) => handleEvent(event),
  reconnect: true,
});

// WebSocket
const { connected, send } = useWebSocketStream({
  url: "wss://api.example.com/ws",
  parse: (data) => JSON.parse(data) as Message,
  onMessage: (msg) => handleMessage(msg),
  reconnect: true,
});
```

### Error Boundary

An Effect-aware error boundary that classifies errors by kind (`interruption`, `failure`, `defect`) with per-kind fallbacks.

```tsx
import { EffectErrorBoundary } from "@effect-react/react";

<EffectErrorBoundary
  fallback={({ error, kind, reset }) => (
    <div>
      <p>Something went wrong ({kind})</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
  interruptionFallback={<p>Request was canceled</p>}
  failureFallback={({ error, reset }) => <FailureUI error={error} onRetry={reset} />}
  defectFallback={<p>Unexpected error</p>}
  resetKeys={[userId]}
  onError={(error) => logError(error)}
>
  <Suspense fallback={<Spinner />}>
    <UserProfile />
  </Suspense>
</EffectErrorBoundary>;
```

### Schema → Use effect/Schema

Effect provides a full schema/validation system. See the [Schema docs](https://effect.website/docs/schema/introduction).

```ts
import { Schema } from "effect";

const User = Schema.Struct({ id: Schema.Number, name: Schema.String });
const decoded = Schema.decodeUnknown(User)(rawData);
```

### Browser

Headless sources for browser APIs: clipboard, geolocation, permissions, network status, and page visibility. Each returns a `useSyncExternalStore`-compatible interface.

```tsx
import {
  createClipboardSource,
  createGeolocationSource,
  createNetworkStatusSource,
  createVisibilitySource,
  createPermissionsSource,
} from "@effect-react/react";

const clipboard = createClipboardSource();
await clipboard.write("Hello");
const text = await clipboard.read();

const geo = createGeolocationSource();
const stopWatching = geo.start();

const network = createNetworkStatusSource();
// network.getSnapshot().online

const visibility = createVisibilitySource();
// visibility.getSnapshot().visibilityState
```

### Concurrency

Semaphores, task queues with overflow strategies (`backpressure`, `drop`, `slide`), and rate-limited runners.

```tsx
import { useSemaphore, createTaskQueue, createRateLimitedRunner } from "@effect-react/react";

// React hook: limit concurrent tasks
const { run, active, pending, clear } = useSemaphore(3);
await run(() => fetchData());

// Standalone task queue
const queue = createTaskQueue({ capacity: 100, concurrency: 5, overflow: "slide" });
await queue.enqueue(() => processItem(item));

// Rate limiter: max 10 calls per second
const limiter = createRateLimitedRunner({ limit: 10, interval: "1 second" });
await limiter.run(() => callApi());
```

### Optimistic Updates

Queue-based optimistic mutations with rollback and replay.

```tsx
import {
  createOptimisticQueue,
  enqueueOptimisticMutation,
  rollbackOptimisticMutation,
  replayPendingMutations,
} from "@effect-react/react";

const queue = createOptimisticQueue(initialTodos);

const id = enqueueOptimisticMutation(queue, {
  apply: (todos) => [...todos, newTodo],
  rollback: (todos) => todos.filter((t) => t.id !== newTodo.id),
  execute: () => fetch("/api/todos", { method: "POST", body: JSON.stringify(newTodo) }),
});

// On failure
rollbackOptimisticMutation(queue, id);

// Replay all pending mutations (e.g., after reconnect)
const { completed, failed } = await replayPendingMutations(queue);
```

### SSR

Dehydrate and hydrate query cache state for server-side rendering.

```tsx
import * as ssr from "@effect-react/react/ssr";

// Server: serialize cache state
const dehydratedState = ssr.dehydrate(cache);

// Client: restore cache state
ssr.hydrate(cache, dehydratedState);
```

### Scheduling

Run Effect programs on intervals or after timeouts, with automatic cleanup on unmount.

```tsx
import { useIntervalEffect, useTimeoutEffect, useScheduledEffect } from "@effect-react/react";

// Run every 10 seconds
useIntervalEffect(() => Effect.log("heartbeat"), "10 seconds");

// Run once after 5 seconds
useTimeoutEffect(syncEffect, "5 seconds");

// Full control with schedule policy
useScheduledEffect(effect, { kind: "interval", every: "30 seconds" }, enabled);
```

### Persistence

Storage-agnostic persistence for query cache and arbitrary state. Works with `localStorage`, `sessionStorage`, or any custom `PersistenceStorage`.

```tsx
import {
  createPersistenceStore,
  persistQueryState,
  hydrateQueryState,
  createMemoryStorage,
} from "@effect-react/react";

const store = createPersistenceStore({
  key: "app-cache",
  storage: localStorage,
});

// Save and restore query cache
await persistQueryState(cache, store);
await hydrateQueryState(cache, store);

// Persist arbitrary values
const settingsStore = createPersistenceStore({
  key: "settings",
  storage: localStorage,
});
await settingsStore.save({ theme: "dark" });
const settings = await settingsStore.load();
```

### Events

Type-safe event channels with publish/subscribe, one-shot listeners, and Effect integration.

```tsx
import { createEventChannel } from "@effect-react/react";

type AppEvents = {
  "user:login": { userId: string };
  "user:logout": void;
  notification: { message: string };
};

const events = createEventChannel<AppEvents>();

// Subscribe
const unsubscribe = events.subscribe("user:login", (payload) => {
  console.log(payload.userId);
});

// Publish
events.publish("user:login", { userId: "123" });

// One-shot (returns Promise)
const payload = await events.once("notification");

// Effect integration
const loginEffect = events.nextEffect("user:login"); // Effect<{ userId: string }>
const publishEffect = events.publishEffect("notification", { message: "Hello" });
```

### Policies

Debounce and throttle execution policies for Effect programs. Automatically cancels Effect fibers when policies discard work.

```tsx
import { useDebouncedRunner, useThrottledRunner } from "@effect-react/react";

// Debounced search
const { run, cancel, pending } = useDebouncedRunner("300 ms");
const handleChange = (query: string) => {
  run(() => searchEffect(query));
};

// Throttled scroll handler
const throttled = useThrottledRunner("100 ms");
const handleScroll = () => {
  throttled.run(() => trackScrollEffect());
};
```

### Async Utilities

Race condition prevention and circuit breaker for async workflows.

#### Retry & Timeout → Use Effect directly

Effect provides `Effect.retry()` with `Schedule` and `Effect.timeout()` / `Effect.timeoutFail()` natively. See the [Effect retry docs](https://effect.website/docs/error-management/retrying).

```ts
import { Effect, Schedule } from "effect";

// Retry with exponential backoff
const retried = myEffect.pipe(
  Effect.retry(Schedule.exponential("500 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
);

// Timeout
const bounded = myEffect.pipe(Effect.timeout("5 seconds"));
```

#### Latest-Value Guard

```tsx
import { createLatestTokenGuard, runLatestPromise } from "@effect-react/react";

const guard = createLatestTokenGuard();
const result = await runLatestPromise(guard, () => fetchData(query));
if (!result.stale) {
  setData(result.value);
}
```

#### Circuit Breaker

```tsx
import { createCircuitBreaker } from "@effect-react/react";

const cb = createCircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 });
const result = await cb.execute(() => fetchData());
console.log(cb.state()); // "closed" | "open" | "half-open"
```

### Result → Use Effect's Either / Exit

Effect provides `Either` (for success/failure) and `Exit` (for success/failure with Cause). See the [Effect docs](https://effect.website/docs/data-types/either).

```ts
import { Either, Exit, Option } from "effect";

const result = Either.right(42);
const failure = Either.left("not found");
```

---

## Why Effect-React?

**Structured errors everywhere.** Every hook surfaces typed `Cause<E>` values -- no more `unknown` catches or untyped error boundaries. The `EffectErrorBoundary` classifies errors into interruptions, failures, and defects automatically.

**Fiber cancellation by default.** Queries cancel on unmount. Mutations cancel on unmount. Debounced/throttled effects cancel stale fibers. No manual `AbortController` wiring.

**One dependency graph.** Your runtime, services, query cache, mutations, forms, state, streams, scheduling, concurrency, and persistence all flow through a single `ManagedRuntime` provided at the root. No adapter layers between libraries.

**Composable primitives.** Every API returns or accepts `Effect` values. Retry an HTTP call, decode the response, cache it with `useQuery`, and debounce the trigger -- all in one pipeline with full type safety.

---

## Tree-Shakeable Imports

Every module is available as a standalone subpath export:

```tsx
import { useQuery } from "@effect-react/react/query";
import { useMutation } from "@effect-react/react/mutation";
import { useForm } from "@effect-react/react/forms";
import { useSubscriptionRef } from "@effect-react/react/state";
import { useSemaphore } from "@effect-react/react/concurrency";
import { useDebouncedRunner } from "@effect-react/react/policies";
import { useIntervalEffect } from "@effect-react/react/scheduling";
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## License

MIT
