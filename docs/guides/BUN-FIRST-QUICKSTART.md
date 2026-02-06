# Bun-First Quickstart

This is the fastest way to create and run an `effect-react` app using Bun.

## 1. Scaffold

```bash
bunx effect-react new my-app
```

## 2. Install

```bash
cd my-app
bun install
```

## 3. Run

```bash
bun run dev
```

## 4. Build + preview

```bash
bun run build
bun run start
```

## What the starter includes

- `vite` + React app wiring
- `effectReactVitePlugin()` enabled in `vite.config.ts`
- `EffectProvider` runtime setup in `src/App.tsx`
- `src/routes/*` and `src/actions/*` examples for framework discovery

## Full-stack runtime composition

When you want to compose discovered routes/actions into a runtime app:

```ts
import { Effect } from "effect";
import { defineAppFromManifests } from "@effect-react/react/framework";

const app = await Effect.runPromise(
  defineAppFromManifests({
    runtime,
    actionManifestModule,
    routeManifestModule,
  }),
);
```

Use `app.createServerHandler()` for request handling and `app.createSsrHandler()` for SSR request orchestration.
