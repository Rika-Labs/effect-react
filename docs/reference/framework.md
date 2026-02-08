# `@rika-labs/effect-react/framework`

Framework composition and typed contracts.

## Core APIs

- `createApp(options)`
- `defineManifest(manifest)`
- `definePage(page)`
- `defineLayout(layout)`
- `defineMiddleware(middleware)`
- `defineRoute(route)`
- `defineLoader(loader)`
- `defineAction(action)`
- `routesFromManifest(manifest)`
- `loadersFromManifest(manifest)`
- `cachePolicy(policy)`
- `noStore()`

## `createApp` result

`createApp` returns an `EffectReactApp` with:

- `manifest`
- resolved `config`
- managed `runtime`
- `actions`
- `matchPage(href)`
- `handleActionRequest(request)`
- `dispose()`

## Minimal example

```ts
import { createElement } from "react";
import {
  createApp,
  defineManifest,
  definePage,
  defineRoute,
} from "@rika-labs/effect-react/framework";

const homeRoute = defineRoute({ id: "home", path: "/" });

const homePage = definePage({
  id: "home.page",
  route: homeRoute,
  component: () => createElement("main", undefined, "Home"),
});

const app = createApp({
  manifest: defineManifest({
    pages: [homePage],
  }),
});
```

## Vite discovery contract

Vite discovery APIs are exported from `@rika-labs/effect-react/framework/vite`:

- `effectReactVitePlugin(options?)`
- `discoverAppModules(root, appDir?)`

`effectReactVitePlugin` scans `appDir` (default `app`) for:

- pages: `**/page.tsx|ts|jsx|js`
- layouts: `**/layout.tsx|ts|jsx|js`
- actions: `app/actions/**/*.{ts,tsx,js,jsx}`
- middleware: `app/middleware.ts|tsx|js|jsx`
