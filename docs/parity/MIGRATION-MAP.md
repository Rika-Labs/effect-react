# Migration Map (Next.js + TanStack -> effect-react)

This guide maps common application-layer patterns to current `effect-react` primitives.

## Routing and Navigation

- Next.js `app/` + `next/navigation` -> `defineRoute`, `createRouter`, `RouterProvider`, `Link`
- TanStack Router route tree -> `defineRoute` + nested `children`
- Route prefetch -> `usePrefetchRoute`

## Data Loading

- Next.js server data in route segments -> route loaders (`defineRouteLoader`)
- TanStack Router loaders -> `runRouteLoaderChain` + router `loaderState`
- Revalidation -> `router.revalidate()` or `useRevalidateRouteLoaders()`

## Server Functions / Mutations

- Next.js server actions -> `defineServerAction` + `callServerAction` / `useServerAction`
- RPC transport glue -> `createFetchServerActionTransport`
- Typed wire errors -> `ErrorTransportCodec` + action error codec decode on client

## SSR and Hydration

- Next.js streaming render -> `renderEffectToString` / `renderEffectToReadableStream`
- Dehydrate + hydrate query cache -> `dehydrate`, `hydrate`
- Framework hydration envelope (query + loader state) ->
  - `dehydrateFrameworkState`
  - `createFrameworkHydrationScript`
  - `parseFrameworkHydrationState`
  - `hydrateFrameworkState`

## Build and Runtime Tooling

- Next.js compile/runtime integration -> `effectReactVitePlugin()`
- Virtual route/action manifests -> `virtual:effect-react/routes`, `virtual:effect-react/actions`
- Server action call transform -> plugin rewrite to `callServerActionByName`
- App lifecycle commands -> `effect-react dev`, `effect-react build`, `effect-react start`

## Adapter Targets

- Node runtime -> `serveWithNode`
- Bun runtime -> `serveWithBun`

## Recommended Migration Order

1. Replace data-fetching hooks with `useQuery` / `useMutation`.
2. Introduce `defineRoute` + `RouterProvider` while preserving existing UI.
3. Move server functions to `defineServerAction` and typed transports.
4. Adopt framework hydration envelope for SSR + route loader state.
5. Switch build/runtime to Vite plugin + Effect CLI lifecycle commands.
