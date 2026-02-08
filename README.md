# @effect-react/react

Effect-native full-stack React framework.

React renders. Effect executes.

Use one Effect runtime for loaders, actions, navigation, SSR, and hydration with typed boundaries and explicit cache policy.

## Install

```bash
bun add @effect-react/react effect react react-dom
```

## Public Modules

- `@effect-react/react/framework`
- `@effect-react/react/framework/vite`
- `@effect-react/react/config`
- `@effect-react/react/server`
- `@effect-react/react/client`
- `@effect-react/react/testing`

## App Layout

```txt
app/
  layout.tsx
  page.tsx
  users/
    [id]/
      page.tsx
  actions/
    counter.increment.ts
```

## Quick Start

### 1) Vite discovery

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { effectReactVitePlugin } from "@effect-react/react/framework/vite";

export default defineConfig({
  plugins: [react(), effectReactVitePlugin({ appDir: "app" })],
});
```

### 2) Route with Effect loader

```tsx
// app/page.tsx
import { Effect } from "effect";
import { defineLoader, definePage, defineRoute } from "@effect-react/react/framework";

const route = defineRoute({
  id: "home",
  path: "/",
});

const loader = defineLoader({
  name: "home.loader",
  routeId: route.id,
  run: () =>
    Effect.succeed({
      headline: "Effect drives app execution",
    }),
});

const HomePage = () => <main>Hello from effect-react</main>;

export const page = definePage({
  id: "home.page",
  route,
  loader,
  component: HomePage,
});

export default page;
```

### 3) Typed Effect action

```ts
// app/actions/counter.increment.ts
import { Effect, Schema } from "effect";
import { defineAction } from "@effect-react/react/framework";

export const counterIncrement = defineAction({
  name: "counter.increment",
  input: Schema.Struct({ value: Schema.Number }),
  output: Schema.Struct({ value: Schema.Number }),
  error: Schema.Struct({ reason: Schema.String }),
  handler: ({ value }) =>
    value < 0
      ? Effect.fail({ reason: "must be >= 0" })
      : Effect.succeed({ value: value + 1 }),
});
```

### 4) Server handler

```ts
// src/server.ts
import { createApp } from "@effect-react/react/framework";
import { createRequestHandler } from "@effect-react/react/server";
import manifest from "virtual:effect-react/manifest";

const app = createApp({ manifest });

export const handler = createRequestHandler({ app });
```

### 5) Client hydrate

```ts
// src/client.tsx
import { hydrateApp } from "@effect-react/react/client";
import { createApp } from "@effect-react/react/framework";
import manifest from "virtual:effect-react/manifest";

const app = createApp({ manifest });

await hydrateApp({ app });
```

## License

MIT
