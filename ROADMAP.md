# Roadmap

This document describes where `@effect-react/react` is today, where it is going, and how you can help shape its direction.

## v0.1 (Current)

**Status: initial public release**

The v0.1 release ships the full primitive surface as a single coherent toolkit. Every module listed below is available today with tree-shakeable subpath exports:

| Module           | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `provider`       | React context bridge for Effect runtimes and layers                |
| `query`          | Query cache with deduplication, ref counting, cancellation, and GC |
| `mutation`       | Mutation lifecycle with rollback support                           |
| `state`          | Effect-native client state via SubscriptionRef                     |
| `ssr`            | Server-side dehydration and client-side hydration                  |
| `error-boundary` | Error boundary bridge with typed error channels                    |
| `forms`          | Form hooks with async validation pipelines                         |
| `streams`        | Stream and realtime subscription hooks                             |
| `events`         | Event bus and pub/sub primitives                                   |
| `scheduling`     | Schedule-backed timing hooks and runners                           |
| `policies`       | Retry, timeout, and debounce/throttle policies                     |
| `concurrency`    | Semaphore, queue, and rate-limited runners                         |
| `optimistic`     | Optimistic update replay and rollback                              |
| `persistence`    | Typed persistence for query and state hydration                    |
| `browser`        | Clipboard, geolocation, network, visibility sources                |
| `async`          | Circuit breaker and latest-value guard                             |
| `devtools`       | Runtime diagnostics and query cache introspection                  |

**What's production-ready:** The core loop -- provider, query, mutation, state, SSR, and error boundary -- has been designed against audited Effect primitives and is the most tested surface. Teams comfortable with Effect can adopt these modules with confidence.

**What's experimental:** Modules toward the edges of the surface -- forms, streams, browser sources, optimistic updates, persistence -- are functional and tested but have seen less real-world usage. APIs in these modules are more likely to change before v1.0.

## v0.2 (Near-term)

Focus: **hardening and community feedback**.

- Gather real-world usage data from early adopters
- Stabilize hook API signatures based on feedback
- Expand test coverage for edge cases in React concurrent mode
- Improve error messages and developer experience
- Add integration examples for common frameworks (Next.js, Remix, Vite)
- Address any parity gaps discovered through adoption

## v0.3 (Medium-term)

Focus: **API refinement and ecosystem readiness**.

- Lock down public API surface for core modules (query, mutation, state, provider)
- Add migration guides from TanStack Query, SWR, and Zustand
- Performance benchmarks against incumbent libraries
- Improve SSR story for streaming and partial hydration patterns
- Expand devtools with timeline and dependency graph views
- Harden concurrency controls under React 19 concurrent features

## v1.0 (Stable Release)

Focus: **production confidence and semver commitment**.

The v1.0 release will signal that:

- **Core APIs are stable** -- query, mutation, state, provider, SSR, and error boundary have a semver contract. Breaking changes follow major version bumps only.
- **Query fundamentals are proven** -- deduplication, ref counting, cancellation, GC, and SSR hydration pass comprehensive test suites and have been validated in production use cases.
- **Tree-shaking is verified** -- subpath exports are validated in CI and bundle size is tracked.
- **Scheduling and policy primitives are shipped** -- debounce, throttle, retry, and timeout primitives work without provider-specific coupling.
- **Deterministic key hashing** is stable and does not rely on `Hash.hash` for plain-object keys.
- **Documentation** covers API contracts, lifecycle behavior, and integration patterns.

### Exit criteria (from internal roadmap)

- Query dedupe, ref counting, cancellation, and GC pass tests
- SSR hydrate/dehydrate is stable for success states
- Tree-shaken subpath exports are validated
- Duration and runtime execution adapters wrap audited Effect APIs
- Scheduling and debounce/throttle primitives ship without provider-specific coupling

## v2.0

Focus: **mutation maturity and suspense safety**.

- Mutation lifecycle and rollback behavior fully verified
- Suspense query and error boundary paths are deterministic
- Invalidation APIs support exact keys and predicates
- Concurrency control primitives (semaphore, queue, rate-limit) are fully test-covered

## v3.0

Focus: **Effect-native client state**.

- SubscriptionRef bridge validated under React concurrency
- Selector/equality support reliably suppresses unnecessary rerenders
- Persistence and optimistic/offline primitives integrate with query and state
- Replacement path documented for Zustand, Jotai, and selected Redux usage

## v4.0

Focus: **forms, realtime, and browser primitives**.

- Form pipelines support async validation with cancellation
- Stream/realtime hooks handle reconnect and teardown correctly
- Browser effect source primitives available as headless adapters
- Production integration examples in documentation

## v5.0

Focus: **full consolidation and enterprise readiness**.

- Migration guides cover common library stacks end to end
- Testing, documentation, and devtools meet rollout baseline
- Breaking-change policy and semver posture are explicit
- Broad stack consolidation: one model replacing query cache + retry/timeout helpers + cancellation code + validation code + error wrappers

## Future Vision

Beyond the versioned roadmap:

- **React Server Components** -- Effect pipelines that run on the server and stream typed results to client components
- **Streaming SSR** -- progressive hydration with Effect-managed resource lifecycles
- **Framework adapters** -- first-class integration packages for Next.js App Router, Remix, and other RSC-capable frameworks
- **DevTools extension** -- standalone browser extension for inspecting Effect runtime, query cache state, and fiber lifecycle

## Known Limitations

As of v0.1, there are no open parity gaps in the documented primitive surface. All previously identified gaps have been resolved:

- Subpath export boundaries: resolved (multi-entry build with explicit subpath exports)
- API lifecycle contracts: resolved (lifecycle contract documentation added)
- Export-map integrity: resolved (CI validation via `scripts/check-exports.ts`)
- Devtools diagnostics: resolved (`QueryCache.diagnostics` and devtools APIs added)

New limitations will be tracked in the [Parity Gaps Tracker](.context/docs/PARITY-GAPS-TRACKER.md) as they are discovered.

## Boundary Rules

The project maintains strict boundaries on what it will and will not include:

- **Yes:** composable primitives that work with any backend, any auth provider, any framework
- **No:** provider-specific wrappers (NextAuth, Auth0, LaunchDarkly, etc.)
- **No:** routing or navigation effect integrations

This keeps the library focused and avoids the integration drift that plagues large wrapper ecosystems.

## Philosophy

`@effect-react/react` exists because most React applications accumulate too many async models. Query caches, retry helpers, cancellation code, validation logic, and error wrappers each bring their own semantics. Over time, these diverge.

This library replaces that accumulation with one model: **Effect pipelines run by React-safe lifecycle adapters.**

The practical results:

1. **Typed error channels** -- failures stay typed, defects and interruptions are distinguishable, UI boundaries render by error category instead of string matching
2. **Correct cancellation** -- fibers are interrupted, scope-owned resources are closed, shared in-flight work is reference-counted
3. **Clean dependency injection** -- Effect Layer allows test-time service replacement without module mocking
4. **Fewer dependencies** -- duplicated concerns that span many packages collapse into composable primitives
5. **Incremental adoption** -- add the provider, migrate one query, then expand only where the value is clear

## Influencing the Roadmap

This roadmap is not fixed. It reflects current priorities, but community input shapes what ships and when.

**Ways to contribute:**

- **Open an issue** describing your use case, especially if it is not well served by the current surface
- **Share feedback** on API ergonomics after trying a module in a real project
- **Report edge cases** in concurrent mode, SSR, or specific framework integrations
- **Propose primitives** that fit the boundary rules (composable, provider-agnostic, Effect-native)
- **Submit PRs** for bug fixes, test coverage, documentation, or new primitives

The best way to influence priorities is to describe the problem you are solving. Feature requests grounded in real use cases move faster than abstract suggestions.
