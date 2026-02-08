# Bun Quickstart (0.0.1)

## Prerequisites

- Bun
- React 19+
- Effect 3+

## 1. Install

```bash
bun add @rika-labs/effect-react effect react react-dom
```

## 2. Define app contracts

```ts
import { Effect, Schema } from "effect";
import {
  createApp,
  defineAction,
  defineManifest,
  definePage,
  defineRoute,
} from "@rika-labs/effect-react/framework";
import { createElement } from "react";

const homeRoute = defineRoute({
  id: "home",
  path: "/",
});

const ping = defineAction({
  name: "ping",
  input: Schema.Struct({ message: Schema.String }),
  output: Schema.Struct({ message: Schema.String }),
  error: Schema.Struct({ reason: Schema.String }),
  handler: ({ message }) => Effect.succeed({ message }),
});

const homePage = definePage({
  id: "home.page",
  route: homeRoute,
  component: () => createElement("main", undefined, "Hello"),
});

export const app = createApp({
  manifest: defineManifest({
    pages: [homePage],
    actions: [ping],
  }),
});
```

## 3. Create server handler

```ts
import { createRequestHandler } from "@rika-labs/effect-react/server";
import { app } from "./app";

export const handler = createRequestHandler({ app });
```

## 4. Hydrate on the client

```ts
import { hydrateApp } from "@rika-labs/effect-react/client";
import { app } from "./app";

await hydrateApp({ app });
```

## Optional: Vite app discovery

Use `effectReactVitePlugin()` from `@rika-labs/effect-react/framework/vite` to generate a virtual manifest from `app/**` files (`page.*`, `layout.*`, `app/actions/*`, `app/middleware.*`).
