# effect-react Agent Guidelines

You must rely heavily on the effect package/submodule, before making any changes, research to see if the effect package has primitives that we can build with or off of instead of building something ourselves.

## Effect-First Design

- All effectful code MUST be authored with Effect primitives (`Effect`, `Layer`, `Context`, `Schedule`, `Stream`, `Queue`, etc.), not ad-hoc Promise/async control flow.
- If a public API must return `Promise` for platform interop, implement the internals as an `Effect` program first and only bridge at the outermost boundary.
- Use `Effect` for effectful boundaries: async operations, I/O, network, timers, dependency injection (`Layer`), cancellation, retries, and typed failure channels.
- Keep pure deterministic helpers as plain TypeScript functions (no `Effect.sync` wrapping for simple math/transforms).
- At boundaries where values are unknown (`HTTP`, `URL`, `JSON`, browser globals), decode/validate early and convert to typed domain values.

## Type Safety Requirements

- Do not expose `any` in public APIs.
- Use `unknown` only at trust boundaries and immediately narrow it with schema/guards.
- Preserve typed errors across client/server boundaries whenever possible.
- Prefer explicit generic types over widening casts.

## Full-Stack Composition

- Routes, loaders, mutations, middleware, validation, and error handling should compose as `Effect` programs.
- Server-side execution should use Effect runtime/layers rather than ad-hoc global state.
- Shared contracts between client and server should stay strongly typed end-to-end.
