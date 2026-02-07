# Framework

## Purpose

Compose full-stack runtime apps from route/action manifests and SSR orchestrators.

## Imports

```ts
import {
  defineApp,
  defineAppFromManifest,
  defineAppFromManifests,
  effectReactVitePlugin,
} from "@effect-react/react/framework";
```

## Key APIs

- app composition: `defineApp`, `defineAppFromManifest`, `defineAppFromManifests`
- runtime composition: `composeFrameworkRuntime`, `mergeRouteLoaders`
- manifest registries: `loadRoutesFromManifest`, `loadServerActionsFromManifest`
- file routes: `defineFileRoute`, `createFileRouteManifest`, `createNestedFileRouteTree`
- SSR orchestration: `runFrameworkSsrOrchestrator`, `createFrameworkSsrRequestHandler`
- Vite integration: `effectReactVitePlugin`

## Behavior Guarantees

- manifest-driven app composition keeps server/client route/action contracts aligned.
- SSR orchestration keeps render-mode and hydration transport explicit.

## Failure Model

- manifest loading and module resolution failures are represented with typed framework errors.

## Minimal Example

```ts
import { Effect } from "effect";
import { defineAppFromManifests } from "@effect-react/react/framework";

const app = await Effect.runPromise(
  defineAppFromManifests({
    runtime,
    routeManifestModule,
    actionManifestModule,
  }),
);
```

## Related

- [`server.md`](server.md)
- [`router.md`](router.md)
- [`ssr.md`](ssr.md)
