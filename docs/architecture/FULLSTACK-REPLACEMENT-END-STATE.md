# Effect React Full-Stack Replacement Plan

## Purpose

This document defines the end-state architecture and high-level execution plan for making `effect-react` a full-stack, Effect-first framework that can replace:

- Next.js application-layer concerns (routing, server functions, SSR streaming, build/runtime orchestration)
- TanStack primitives currently used in apps (router, query integration points, table, virtual, form-related patterns)

This plan is intentionally written as a handoff for implementation by another model or engineer.

## Implementation Status (Current)

Implemented slices in the current repository:

- Unified Effect request pipeline (`src/server/pipeline.ts`) wired through `defineApp().createServerHandler()`.
- Trust-boundary decoding for server action HTTP payloads and wire responses (`src/server/decode.ts`, `src/server/http.ts`).
- Typed server action error roundtrip with codecs and name-based dispatch path (`src/server/actions.ts`).
- Router loader lifecycle state machine with pending/success/failure/defect states and revalidation (`src/router/loader.ts`, `src/router/router.ts`, `src/router/react.tsx`).
- Framework hydration protocol including query + route loader state (`src/ssr/dehydrate.ts`, `src/ssr/hydrate.ts`, `src/server/ssr.ts`).
- Bun + Node adapters implemented with Effect-first internals (`src/adapters/**`).
- Effect CLI lifecycle commands on top of Vite (`src/cli/**`).
- Vite framework plugin with virtual route/action modules and server-action call transform (`src/framework/vite.ts`).
- Manifest-backed app composition for server action discovery (`src/framework/actionRegistry.ts`, `src/framework/app.ts`).

Validation gates currently enforced and green in repo:

- `bun run check`
- Global branch coverage >= 90%

## North Star

Build a framework where a full-stack feature (route, loader, mutation, middleware, validation, error handling, streaming UI) is one composable Effect program with end-to-end type safety.

## End-State Product Definition

At end state, teams can:

1. Define routes with filesystem conventions and typed code APIs.
2. Define loaders and server functions as Effect programs with Layer-based dependencies.
3. Render via streaming SSR with typed hydration and route-level suspense/error boundaries.
4. Deploy the same app to Node and Bun first, then optional edge adapters.
5. Replace most app-level Next.js/TanStack glue without changing mental models between client and server.

## Architectural Principles (Non-Negotiable)

1. Effect-first execution:
   - Every async/IO boundary is an `Effect`.
   - Pure helpers remain pure functions.
2. End-to-end type safety:
   - No `any` in public APIs.
   - `unknown` only at trust boundaries, immediately decoded/narrowed.
3. Single programming model:
   - Client and server flows share contracts, error shapes, and Effect semantics.
4. Layer-native DI:
   - Request-scoped services and app services are resolved through Layer, not ad-hoc globals.
5. Framework-agnostic deployment core:
   - Core runtime is platform-neutral; adapters are separate packages.

## Target Architecture

## 1) Build/Compile Layer

Components:

- `@effect-react/framework-vite` plugin
- Route manifest generator
- Server-function call-site transform
- Typed virtual module generation (`virtual:effect-react/routes`, `virtual:effect-react/actions`)

Responsibilities:

- Discover route files and layout hierarchy.
- Generate strongly-typed route tree and action registry.
- Rewrite client calls to server functions into transport invocations with retained types.
- Produce build artifacts for SSR and client hydration.

## 2) Runtime Layer (Server)

Components:

- Request pipeline runtime
- Route matcher + loader executor
- Server-function dispatcher
- SSR streaming renderer
- Middleware chain

Responsibilities:

- Resolve route + params + search.
- Run middleware, loaders, and actions in Effect scopes.
- Support redirects/not-found/errors as typed control flow.
- Stream React output and hydration payload.
- Enforce request cancellation and resource cleanup.

## 3) Runtime Layer (Client)

Components:

- Typed router state machine
- Prefetch/cache bridge
- Navigation + URL state integration
- Hydration/resume protocol

Responsibilities:

- Consume server-rendered hydration payload.
- Handle client navigations with route-level loader execution policy.
- Integrate query/state primitives with routing lifecycle.

## 4) Cross-Cutting Layer

Components:

- Serialization/validation codecs
- Error classification and transport mapping
- Observability hooks (timings, traces, diagnostics)

Responsibilities:

- Preserve typed errors across boundaries.
- Guarantee deterministic payload encode/decode.
- Emit lifecycle diagnostics for route/action/render phases.

## Package/Module End State

Recommended package split:

- `@effect-react/react`: client primitives (query/state/forms/streams/table/virtual/router hooks)
- `@effect-react/framework`: framework runtime APIs (app, router integration, actions, SSR)
- `@effect-react/framework-vite`: build plugin and codegen
- `@effect-react/adapter-node` and `@effect-react/adapter-bun`: deployment adapters

Current modules in `src/framework`, `src/router`, `src/server`, `src/url-state`, `src/table`, `src/virtual` become the core substrate for this split.

## Execution Plan (High-Level Milestones)

## Milestone 1: Router and File-System Runtime

Goal:

- Move from primitive route helpers to a production route tree runtime.

Deliverables:

- Nested routes/layouts/index routes/route groups
- Filesystem route manifest generation
- Lazy route chunk loading and prefetch hooks
- Typed route context for loaders and middleware

Acceptance criteria:

- Complex nested app can navigate with full type safety.
- Route params/search/layout outlets are typed through hooks.
- Route manifest is generated at build-time and consumed at runtime.

## Milestone 2: Server Functions and Request Context

Goal:

- Make server-function DX framework-grade and typed by default.

Deliverables:

- Compile-time server-function transform and registry
- Request-scoped Layer injection (headers/cookies/auth/session/services)
- Typed error transport mapping and schema validation
- Action call ergonomics that feel local but execute remotely

Acceptance criteria:

- Client invokes server function with no manual transport wiring.
- Typed failures/defects survive network boundary.
- Request cancellation interrupts running fibers.

## Milestone 3: Streaming SSR and Hydration Protocol

Goal:

- Provide full request-to-stream rendering lifecycle.

Deliverables:

- SSR entry/runtime orchestration
- Streamed HTML with hydration payload channel
- Route-level suspense/error boundary handling
- Redirect/not-found handling integrated into server pipeline

Acceptance criteria:

- End-to-end SSR app works with progressive streaming.
- Hydration resumes correctly on client navigation.
- Error/redirect semantics are deterministic and tested.

## Milestone 4: Caching, Revalidation, and Render Modes

Goal:

- Add app-level caching semantics expected from modern frameworks.

Deliverables:

- Route/loaders cache policy API
- Revalidation triggers (time- and event-based)
- Static prerender support (initial form)
- Incremental regeneration strategy (post-MVP)

Acceptance criteria:

- Loader cache behavior is configurable and predictable.
- Revalidate APIs are typed and tested.
- Static output mode supports a non-trivial app.

## Milestone 5: Tooling and Developer Experience

Goal:

- Make framework usable without custom setup.

Deliverables:

- `create-effect-react-app` starter flow
- `dev/build/start` CLI orchestration
- Error overlays for route/action/loader failures
- Migration guides from Next.js + TanStack stacks

Acceptance criteria:

- New app bootstraps in one command.
- Build/dev workflows are stable.
- Docs cover migration for common patterns.

## Milestone 6: Adapters and Deployment

Goal:

- Stabilize runtime on deploy targets.

Deliverables:

- Node adapter
- Bun adapter
- Adapter contract for future edge runtimes

Acceptance criteria:

- Same app runs on Node and Bun with no app-code changes.
- Adapter API is documented and semver-governed.

## API and Contract Requirements

Public APIs must enforce:

- Typed route params/search/context.
- Typed loader outputs/errors.
- Typed server function input/output/error.
- Typed redirect/not-found control flow.
- No `any` in exported signatures.

## Quality Gates

Each milestone must meet:

1. Static quality:
   - `format:check`, `lint`, `typecheck` all pass
2. Test quality:
   - Unit + integration coverage at or above current repo threshold
   - Branch coverage remains >= 90%
3. Runtime quality:
   - Cancellation and cleanup tests for route/actions/render paths
   - SSR + hydration integration tests for realistic app flows
4. Docs quality:
   - API docs and migration notes updated per milestone

## Out of Scope (For Initial Full-Stack Target)

- RSC parity with Next.js internals
- Provider-specific integrations (auth/flags/platform wrappers)
- Monolithic edge-first runtime from day one

These can be added after Node/Bun core is stable.

## Final Definition of Done

The framework is considered a practical replacement when:

1. A real app can be built with filesystem routes, typed loaders/actions, middleware, and streaming SSR.
2. Client and server share typed contracts with no manual glue code.
3. Teams can deploy to Node/Bun adapters directly.
4. Migration from a representative Next.js + TanStack app is documented and repeatable.
