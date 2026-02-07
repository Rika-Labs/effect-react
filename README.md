# @effect-react/react

[![npm](https://img.shields.io/npm/v/@effect-react/react.svg)](https://www.npmjs.com/package/@effect-react/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Effect-first full-stack React primitives and framework APIs.

Build Next.js and TanStack-style apps with one Effect runtime, typed failures, and cancellation by default.

## Install

```bash
bun add @effect-react/react effect react react-dom
```

```bash
npm install @effect-react/react effect react react-dom
```

Peer dependencies: `effect@^3.19`, `react@^19`, `react-dom@^19`.

## Setup

Create one runtime and provide it at the app root:

```tsx
import { Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "@effect-react/react";

const runtime = ManagedRuntime.make(Layer.empty);

export function AppRoot() {
  return (
    <EffectProvider runtime={runtime}>
      <App />
    </EffectProvider>
  );
}
```

## Start a New App

```bash
bunx effect-react new my-app
cd my-app
bun install
bun run dev
```

## Build Your First Full-Stack Flow

### Query from React with Effect

```tsx
import { Effect } from "effect";
import { useQuery } from "@effect-react/react/query";

export function Users() {
  const result = useQuery({
    key: ["users"],
    query: Effect.tryPromise(() => fetch("/api/users").then((r) => r.json())),
    staleTime: "30 seconds",
  });

  if (result.status === "loading") return <p>Loading...</p>;
  if (result.status === "failure") return <p>Failed to load</p>;
  return <pre>{JSON.stringify(result.data, null, 2)}</pre>;
}
```

### Define and call a typed server action

```tsx
import { Effect } from "effect";
import { defineServerAction, useServerAction } from "@effect-react/react/server";

const createUser = defineServerAction({
  name: "createUser",
  handler: ({ name }: { name: string }) =>
    Effect.tryPromise(() =>
      fetch("/api/users", { method: "POST", body: JSON.stringify({ name }) }),
    ),
});

export function CreateUserButton() {
  const { run, pending } = useServerAction(createUser);
  return (
    <button disabled={pending} onClick={() => run({ name: "Ada" })}>
      Create
    </button>
  );
}
```

## What This Replaces

| Existing stack                          | effect-react module                                           |
| --------------------------------------- | ------------------------------------------------------------- |
| Next.js route handlers + server actions | `@effect-react/react/server`, `@effect-react/react/framework` |
| TanStack Query / SWR                    | `@effect-react/react/query`, `@effect-react/react/mutation`   |
| TanStack Router / React Router          | `@effect-react/react/router`                                  |
| TanStack Form / react-hook-form         | `@effect-react/react/forms`                                   |
| Zustand / Jotai style reactive state    | `@effect-react/react/state`                                   |
| TanStack Table / TanStack Virtual       | `@effect-react/react/table`, `@effect-react/react/virtual`    |

## Choose effect-react if

- You already use Effect on the server and want the same failure/cancellation model in React.
- You want one composable runtime for data loading, mutations, routes, SSR hydration, and policies.
- You want typed `E` channels instead of ad-hoc thrown errors across app boundaries.

## Do not choose effect-react if

- You need strict long-term API stability today. This package is currently `0.1.0`.
- You want a batteries-included framework with no runtime composition choices.
- Your team does not want to use Effect primitives in application code.

## Documentation

| I need to...                                      | Read                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Understand what effect-react is and where it fits | [`docs/getting-started/why-effect-react.md`](docs/getting-started/why-effect-react.md)       |
| Start a Bun-based app quickly                     | [`docs/getting-started/quickstart-bun.md`](docs/getting-started/quickstart-bun.md)           |
| Migrate from Next.js patterns                     | [`docs/getting-started/migrate-from-nextjs.md`](docs/getting-started/migrate-from-nextjs.md) |
| Learn the runtime and full-stack model            | [`docs/concepts/mental-model.md`](docs/concepts/mental-model.md)                             |
| Browse APIs by module                             | [`docs/reference/README.md`](docs/reference/README.md)                                       |
| See all docs entry points                         | [`docs/README.md`](docs/README.md)                                                           |

---

[Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
