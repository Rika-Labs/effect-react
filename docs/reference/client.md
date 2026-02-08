# `@effect-react/react/client`

Client hydration entry point.

## APIs

- `hydrateApp({ app, payload?, globalName? })`
- `defaultHydrationGlobalName` (`"__effectReactHydration"`)

## Behavior

- If `payload` is omitted, `hydrateApp` reads `globalThis[globalName]`.
- If no payload exists, hydration is a no-op.
- If payload exists, hydration runs through the app runtime.

## Minimal example

```ts
import { hydrateApp } from "@effect-react/react/client";
import { app } from "./app";

await hydrateApp({ app });
```
