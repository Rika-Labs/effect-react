# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`@effect-react/react` — an Effect-first React hooks library that consolidates query caching, state management, forms, routing, SSR, and more into a single typed stack. Built on the [Effect](https://effect.website) library with React 19.

## Commands

```bash
bun install                # Install dependencies
bun run check              # Full CI: format + lint + typecheck + effect:check + test + size + docs:check (run before pushing)
bun run test               # Run tests with coverage
bun run test:watch         # Watch mode
bunx vitest run src/__tests__/query.test.ts   # Run a single test file
bun run typecheck          # Type-check with tsgo (native TS compiler)
bun run lint               # Lint with oxlint (type-aware, deny warnings)
bun run lint:fix           # Auto-fix lint issues
bun run format             # Format with oxfmt
bun run format:check       # Check formatting
bun run build              # Build with tsup (ESM + CJS) + tsc (.d.ts)
bun run size:check         # Build + verify bundle size (max 800KB)
```

## Architecture

### Module Structure

Each module in `src/` maps to a subpath export (`@effect-react/react/query`, `@effect-react/react/state`, etc.). There are 25 modules with 29 subpath exports. All modules are tree-shakeable.

### Core Pattern: Effect ↔ React Bridge

The central architectural pattern is bridging Effect's runtime into React's rendering model:

1. **`src/internal/effectRunner.ts`** — Runs an `Effect.Effect<A, E, R>` program, returns a cleanup function that interrupts the fiber. Every hook that executes an Effect uses this.
2. **`src/internal/externalStore.ts`** — Wraps mutable state into a `useSyncExternalStore`-compatible store. This is how all Effect-managed state (query cache entries, SubscriptionRefs, etc.) flows into React without tearing.
3. **`src/provider/EffectProvider.tsx`** — Root provider that injects the Effect `ManagedRuntime` and `QueryCache` into React context. All hooks read from this context.

### Key Modules

- **`query/`** — Query cache with in-flight deduplication, stale-while-revalidate, GC via reference counting, window focus refetch. `QueryCache.ts` is the central data structure.
- **`state/`** — State management via Effect's `SubscriptionRef`. `useSubscriptionRef` bridges a shared ref; `useLocalSubscriptionRef` creates component-scoped state; `useDerived`/`useComputed` for derived values.
- **`mutation/`** — Mutation hook with query invalidation and lifecycle callbacks.
- **`forms/`** — Form management with schema validation, field arrays, and a Controller component.
- **`router/`** — Type-safe routing with loaders, defining routes as Effect programs.
- **`server/`** — Server actions, HTTP utilities, SSR rendering — all composed as Effects.
- **`url-state/`** — URL search param state with typed codecs.
- **`table/`**, **`virtual/`** — Table model and virtualized scrolling.
- **`adapters/`** — Platform adapters (Bun, Node).
- **`cli/`** — CLI tooling for the framework.
- **`internal/`** — Shared utilities: `keyHash.ts` (deterministic query key serialization), `duration.ts` (duration parsing), `pathUtils.ts`, `invariant.ts`, `runtimeContext.ts`.

### How Hooks Work

Hooks follow a consistent pattern:

1. Get the `ManagedRuntime` from context via `useRuntime()`
2. Build an `Effect` program describing the operation
3. Execute it via `effectRunner` which manages fiber lifecycle
4. Expose results through `useSyncExternalStore` (via `externalStore.ts`)
5. Return cleanup that interrupts the fiber on unmount

## Code Style Rules

- **Effect-first**: Use `Effect.Effect<A, E, R>` for async/IO operations. Errors are typed via `Cause<E>`, not thrown exceptions. Keep pure helpers as plain functions.
- **No `any`**: Forbidden in public APIs. Use `unknown` only at trust boundaries with immediate narrowing.
- **No classes**: Prefer plain objects, closures, and factory functions.
- **Readonly everything**: All interface fields use `readonly`. Prefer `readonly` arrays.
- **Explicit return types** on public API functions.
- **Strict TypeScript**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Code must pass `tsgo --noEmit` with zero errors.
- **`consistent-type-imports`**: Use `import type` for type-only imports.

## Testing

- Tests are in `src/__tests__/` using Vitest + jsdom + @testing-library/react.
- Use `renderHook` for hook tests, `vi.useFakeTimers()` for time-dependent tests.
- Coverage thresholds enforced at **90%** (lines, functions, branches, statements).
- Tests commonly set up an Effect `ManagedRuntime` with `Layer` for dependency injection.

## Toolchain

- **Bun** — package manager and script runner
- **oxfmt** — formatter (not Prettier)
- **oxlint** — linter (not ESLint), with type-aware rules via tsgo
- **tsgo** — native TypeScript type checker (not `tsc`)
- **tsup** — JS bundler (ESM + CJS); `tsc` generates `.d.ts`
- **Vitest** — test runner
