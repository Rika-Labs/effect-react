# Bun Quickstart

## Who This Is For

Developers who want to scaffold and run an effect-react app with Bun.

## Prerequisites

- Bun installed
- Node-compatible environment for local dev tools

## Steps

### 1. Scaffold

```bash
bunx effect-react new my-app
```

### 2. Install and run

```bash
cd my-app
bun install
bun run dev
```

### 3. Build and start

```bash
bun run build
bun run start
```

## What the Starter Includes

- Vite + React project wiring
- `effectReactVitePlugin()` discovery for routes and actions
- `EffectProvider` bootstrap with a managed runtime
- example `src/routes/*` and `src/actions/*` entries

## Common Failure Modes

- Missing Bun: install Bun and rerun scaffold
- Plugin not enabled: ensure `effectReactVitePlugin()` is present in `vite.config.ts`
- Runtime not provided: ensure your root component uses `EffectProvider`

## Expected Result

A local app that serves React UI, discovers routes/actions, and runs with an Effect runtime.
