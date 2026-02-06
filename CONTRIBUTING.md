# Contributing to @effect-react/react

Thank you for your interest in contributing! This guide will help you get up and running.

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies with [Bun](https://bun.sh):

```bash
bun install
```

3. Run the full check suite to verify everything works:

```bash
bun run check
```

## Development Scripts

| Script                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `bun run check`        | Run all checks (format, lint, typecheck, test, size) |
| `bun run test`         | Run tests with coverage                              |
| `bun run test:watch`   | Run tests in watch mode                              |
| `bun run lint`         | Lint with oxlint (type-aware, deny warnings)         |
| `bun run lint:fix`     | Lint and auto-fix                                    |
| `bun run format`       | Format with oxfmt                                    |
| `bun run format:check` | Check formatting                                     |
| `bun run typecheck`    | Type-check with tsgo                                 |
| `bun run size:check`   | Build and verify bundle size                         |
| `bun run build`        | Build with tsup (ESM + CJS)                          |

## Toolchain

- **Package manager** -- [Bun](https://bun.sh)
- **Formatter** -- [oxfmt](https://oxc.rs) (`oxfmt`)
- **Linter** -- [oxlint](https://oxc.rs) (`oxlint`) with type-aware rules
- **Type checker** -- [tsgo](https://github.com/nicolo-ribaudo/tsgo) (native TypeScript type checker)
- **Test runner** -- [Vitest](https://vitest.dev) with jsdom environment
- **Bundler** -- [tsup](https://tsup.egoist.dev) (ESM + CJS, with `.d.ts` generation)

## Project Structure

```
src/
  internal/       -- Shared utilities (externalStore, effectRunner, duration, etc.)
  provider/       -- EffectProvider and useRuntime
  query/          -- useQuery, useSuspenseQuery, QueryCache, SSR support
  mutation/       -- useMutation
  state/          -- useDerived, useSubscriptionRef, useLocalSubscriptionRef
  result/         -- Result<A, E> and Effect-to-Result conversions
  async/          -- Retry, timeout, and concurrency primitives
  browser/        -- Browser-specific sources (online, visibility, media query)
  concurrency/    -- Concurrency control (semaphore, mutex-style guards)
  devtools/       -- Diagnostics and devtools integration
  error-boundary/ -- React error boundary for Effect failures
  events/         -- Event channel abstraction
  forms/          -- useForm with schema validation
  http/           -- HTTP client built on Effect
  optimistic/     -- Optimistic update queue
  persistence/    -- Persistence layer (localStorage, etc.)
  policies/       -- Debounce and throttle policies
  scheduling/     -- Scheduled/interval effects
  schema/         -- Schema validation utilities
  ssr/            -- Dehydrate/hydrate for server-side rendering
  streams/        -- Stream subscription hooks
  __tests__/      -- All test files
```

## Code Style

This library is built on [Effect](https://effect.website). Follow these patterns:

- **Effect-first** -- Use `Effect.Effect<A, E, R>` for async/fallible operations. Errors are typed via `Cause<E>`, not thrown exceptions.
- **useSyncExternalStore** -- Hooks bridge Effect state into React through `useSyncExternalStore`. See `src/internal/externalStore.ts` for the shared store primitive.
- **Readonly types** -- All interface fields use `readonly`. Prefer `readonly` arrays and immutable data.
- **Explicit return types** -- Public API functions should have explicit return types.
- **No classes** -- Prefer plain objects, closures, and factory functions.
- **Strict TypeScript** -- The project uses very strict tsconfig settings (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, etc.). All code must pass `tsgo --noEmit` with zero errors.

## Testing

Tests live in `src/__tests__/` and use [Vitest](https://vitest.dev) with [jsdom](https://github.com/jsdom/jsdom).

- Use `@testing-library/react` and `renderHook` for hook tests.
- Use `describe` / `it` / `expect` from Vitest.
- Use `vi.useFakeTimers()` for time-dependent tests; call `vi.useRealTimers()` in `afterEach`.
- Coverage thresholds are enforced at **90%** for lines, functions, branches, and statements. New code must maintain this bar.

Example test structure:

```ts
import { describe, expect, it } from "vitest";
import { myFunction } from "../module";

describe("myFunction", () => {
  it("does the expected thing", () => {
    expect(myFunction(input)).toBe(expected);
  });
});
```

## Pull Request Workflow

1. **Fork and branch** -- Create a feature branch from `main`:
   ```bash
   git checkout -b my-feature
   ```
2. **Make your changes** -- Write code and tests.
3. **Run all checks** before pushing:
   ```bash
   bun run check
   ```
   This runs formatting, linting, type checking, tests, and bundle size verification in sequence.
4. **Push and open a PR** against `main`. Describe what your change does and why.
5. **Address review feedback** -- Keep commits focused and easy to review.

## Reporting Issues

Open an issue with a clear description, steps to reproduce, and expected vs. actual behavior. Minimal reproduction cases are greatly appreciated.

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please be respectful and constructive in all interactions. A formal Code of Conduct will be published before the 1.0 release.
