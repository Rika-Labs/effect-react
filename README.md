# @rika-labs/effect-react

Effect-native full-stack React framework.

React is the view layer. Effect is the execution layer.

## Why This Exists

Modern React apps usually stitch together router, query, form, state, realtime, and SSR tooling with different semantics for retries, cancellation, caching, and errors.

`@rika-labs/effect-react` gives app teams one model across frontend and backend:

- `Effect` for async orchestration, cancellation, retries, streams, and failure values.
- `Schema` for boundary decoding/encoding.
- `Layer` for runtime composition.
- React for rendering.

## What You Get

- SSR by default with hydration state handoff.
- Streaming-enabled runtime defaults.
- File-routing discovery via Vite plugin.
- Typed route loaders and typed actions.
- Built-in modules for state, query, router, form, grid, virtual lists, realtime, and devtools.
- Strict defaults for boundary schemas and typed errors.

## Install

```bash
bun add @rika-labs/effect-react effect react react-dom
```

## 5-File Quickstart

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { effectReactVitePlugin } from "@rika-labs/effect-react/framework/vite";

export default defineConfig({
  plugins: [react(), effectReactVitePlugin({ appDir: "app" })],
});
```

```tsx
// app/page.tsx
import { Effect } from "effect";
import { defineLoader, definePage, defineRoute } from "@rika-labs/effect-react/framework";

const route = defineRoute({
  id: "home",
  path: "/",
});

const loader = defineLoader({
  name: "home.loader",
  routeId: route.id,
  run: () =>
    Effect.succeed({
      headline: "One runtime for the whole app lifecycle",
    }),
});

const HomePage = () => <main>Hello from @rika-labs/effect-react</main>;

export default definePage({
  id: "home.page",
  route,
  loader,
  component: HomePage,
});
```

```ts
// app/actions/counter.increment.ts
import { Effect, Schema } from "effect";
import { defineAction } from "@rika-labs/effect-react/framework";

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

```ts
// src/server.ts
import { createApp } from "@rika-labs/effect-react/framework";
import { createRequestHandler } from "@rika-labs/effect-react/server";
import manifest from "virtual:effect-react/manifest";

const app = createApp({ manifest });

export const handler = createRequestHandler({ app });
```

```ts
// src/client.tsx
import { hydrateApp } from "@rika-labs/effect-react/client";
import { createApp } from "@rika-labs/effect-react/framework";
import manifest from "virtual:effect-react/manifest";

const app = createApp({ manifest });

await hydrateApp({ app });
```

## Effect Model: `Effect<A, E, R>`

- `A`: success value
- `E`: typed error value
- `R`: required services/dependencies

How this maps to the framework:

- Request lifecycle runs in a managed app runtime with core services (`Boundary`, `Data`, `Actions`, `Navigation`, `Telemetry`).
- Loaders/actions/queries are transport-safe contracts with typed success/error channels.
- You can still use custom `R` dependencies at boundaries by providing a `Layer`.

```ts
import { Context, Effect, Layer } from "effect";
import { createElement } from "react";
import { createApp } from "@rika-labs/effect-react/framework";
import { createRequestHandler } from "@rika-labs/effect-react/server";
import manifest from "virtual:effect-react/manifest";

class RequestLogger extends Context.Tag("app/RequestLogger")<
  RequestLogger,
  { readonly info: (message: string) => Effect.Effect<void> }
>() {}

const RequestLoggerLive = Layer.succeed(RequestLogger, {
  info: (message: string) => Effect.sync(() => console.log(message)),
});

const app = createApp({ manifest });

export const handler = createRequestHandler({
  app,
  render: ({ page }) =>
    Effect.gen(function* () {
      const logger = yield* RequestLogger;
      yield* logger.info(`rendering ${page.id}`);
      return createElement(page.component);
    }).pipe(Effect.provide(RequestLoggerLive)),
});
```

## Modules

- `@rika-labs/effect-react/framework`
- `@rika-labs/effect-react/framework/vite`
- `@rika-labs/effect-react/config`
- `@rika-labs/effect-react/server`
- `@rika-labs/effect-react/client`
- `@rika-labs/effect-react/testing`
- `@rika-labs/effect-react/state`
- `@rika-labs/effect-react/query`
- `@rika-labs/effect-react/router`
- `@rika-labs/effect-react/form`
- `@rika-labs/effect-react/grid`
- `@rika-labs/effect-react/virtual`
- `@rika-labs/effect-react/realtime`
- `@rika-labs/effect-react/devtools`

## Docs

- Docs index: [`docs/README.md`](docs/README.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT
