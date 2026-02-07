# Router

## Purpose

Define typed routes, loaders, and navigation primitives for React applications.

## Imports

```ts
import {
  defineRoute,
  createRouter,
  RouterProvider,
  defineRouteLoader,
  Link,
  Outlet,
} from "@effect-react/react/router";
```

## Key APIs

- route definition: `defineRoute`, route type helpers
- router runtime: `createRouter`, `createMemoryRouterHistory`
- React bindings: `RouterProvider`, `useNavigate`, `useParams`, `useRouteSearch`
- data loading: `defineRouteLoader`, `runRouteLoaderChainEffect`
- errors: `redirect`, `notFound`, `RedirectError`, `NotFoundError`

## Behavior Guarantees

- path params and search params stay type-safe from route definition to usage.
- route loader snapshots track pending/success/failure states.

## Failure Model

- redirects and not-found are modeled as explicit typed errors.

## Minimal Example

```tsx
import { defineRoute, createRouter, RouterProvider } from "@effect-react/react/router";

const homeRoute = defineRoute({ path: "/" });
const router = createRouter({ routes: [homeRoute] as const });

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

## Related

- [`url-state.md`](url-state.md)
- [`server.md`](server.md)
- [`framework.md`](framework.md)
