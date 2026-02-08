# effect-react Expansion Plan (All-In Effect-Native Platform)

## Objective

Evolve `@effect-react/react` from framework core into an all-in, modular Effect-native platform so teams can build advanced apps without adding third-party state/query/router/form/table/realtime libraries.

## Product Principles

1. React renders; Effect executes.
2. All framework workflows are modeled as `Effect<A, E, R>`.
3. `E` is typed failure channel and `R` is typed dependency environment.
4. Default APIs are Effect-native; React primitives are escape hatches.
5. Single package with modular subpath exports.

## Scope for This Implementation Pass

Add first-party modules with stable initial APIs:

- `state`
- `query`
- `router`
- `form`
- `grid`
- `virtual`
- `realtime`
- `devtools`

Then integrate package exports/build/test/docs.

## Execution Strategy

Implement in parallel by module ownership using subagents:

1. State module + tests
2. Query/Router module + tests
3. Form module + tests
4. Grid/Virtual module + tests
5. Realtime/Devtools module + tests
6. Integration (exports, tsup/tsconfig/vitest/lint include, docs)

## Detailed Deliverables

### 1) State (`src/state`)

- `createStore(initial)`
- `createStoreFromEffect(effect)`
- `Store` tag/service model using `SubscriptionRef`
- `get`, `set`, `update`, `modify`, `changes`
- `select` and derived selector APIs
- React hooks:
  - `useStore(store)`
  - `useStoreSelector(store, selector)`

### 2) Query (`src/query`)

- Wrapper layer on current data runtime to provide query-native API:
  - `defineQuery` re-export
  - `useQuery`, `useSuspenseQuery`
  - `useInfiniteQuery` initial support
  - invalidation helpers
- Keep Effect-based execution and typed errors.

### 3) Router (`src/router`)

- Router-facing module over current navigation runtime:
  - `defineRoute`, `defineLoader`
  - `useNavigate`, `useNavigationSnapshot`
  - URL helpers for params/search extraction
- Typed helpers for pathname/search intent.

### 4) Form (`src/form`)

- `defineForm` with schema + defaults
- `FormState` with values/errors/touched/dirty/submitting/submitted
- `validate`, `setField`, `reset`, `submit` as `Effect`
- React hook `useForm` for store subscription and command execution.

### 5) Grid + Virtual (`src/grid`, `src/virtual`)

- `defineColumns` and row projection utilities
- sort/filter/paginate helpers
- virtualization helpers:
  - visible range calculation
  - offset/total size calculations
- pure deterministic helpers where possible.

### 6) Realtime + Devtools (`src/realtime`, `src/devtools`)

- Realtime channel primitive using `PubSub`:
  - `createChannel`, `publish`, `subscribe`
- Presence store helper built on state + channel
- Devtools stream over telemetry + runtime events
- Helper API to consume event stream in React.

### 7) Integration

- Exports:
  - root + subpath exports in `package.json`
- Build/type/lint/test config updates:
  - `tsup.config.ts`
  - `tsconfig.json`
  - `tsconfig.build.json`
  - `vitest.config.ts`
  - lint script paths
- Root `src/index.ts` re-exports
- Docs refresh:
  - README module list and short usage references.

## Testing Plan

Add tests for each new module:

1. `state`:
   - updates/selectors/derived values.
2. `query`:
   - query wrapper smoke + infinite pagination baseline.
3. `router`:
   - route/url helper behavior.
4. `form`:
   - validation flow and submit state transitions.
5. `grid/virtual`:
   - sorting/filter/range computations.
6. `realtime/devtools`:
   - channel publish/subscribe and event stream behavior.

## Validation Gate

All of the following must pass:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run effect:check`

## Constraints

1. No backward compatibility layer.
2. Avoid non-Effect async control flow in source modules.
3. Keep API names explicit and typed.
4. Keep module boundaries clear and tree-shakeable.

## Done Definition

This pass is complete when:

1. New modules exist with typed initial APIs.
2. They are exported/buildable/tested.
3. Existing framework remains functional.
4. Validation gate is green.
