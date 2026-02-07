# Migrate from Next.js and TanStack-Style Stacks

## Who This Is For

Teams moving from Next.js route handlers/server actions and TanStack-style client primitives.

## Mental Model Shift

- Next.js convention-first runtime becomes explicit runtime composition
- Promise/error throwing patterns become Effect values with typed failures
- split client/server data glue becomes shared action/route contracts

## Mapping

| Existing pattern       | effect-react replacement                             |
| ---------------------- | ---------------------------------------------------- |
| Next.js route handlers | `defineRouteHandler` in `@effect-react/react/server` |
| Next.js server actions | `defineServerAction` + `useServerAction`             |
| TanStack Query         | `useQuery`, `useSuspenseQuery`, `QueryCache`         |
| TanStack Router        | `defineRoute`, `createRouter`, `RouterProvider`      |
| URL state libs         | `defineSearchSchema`, `useUrlState`, `useUrlStates`  |
| SSR hydration glue     | `@effect-react/react/ssr` + framework SSR helpers    |

## Migration Steps

1. Introduce `EffectProvider` at app root.
2. Migrate read paths to `useQuery` and write paths to `useMutation`/server actions.
3. Move route definitions to `defineRoute` and wire `createRouter` + `RouterProvider`.
4. Replace ad-hoc server boundaries with `defineRouteHandler` and request pipeline helpers.
5. Adopt framework discovery (`effectReactVitePlugin`) when ready for file route/action manifests.

## Common Failure Modes

- Mixed Promise and Effect orchestration causing duplicate retries
- untyped action inputs without schema validation
- missing hydration wiring when adding SSR

## Expected Result

A staged migration that preserves behavior while converging on one Effect runtime model.
