# `@effect-react/react/server`

HTTP request handling for an `EffectReactApp`.

## API

- `createRequestHandler(options)`

## Behavior

- `POST` requests to `actionPath` (default `"/_actions"`) are routed to `app.handleActionRequest`.
- Other requests run SSR through framework navigation and rendering.
- If no page matches, the default response renders a `Not Found` React element.

## Options

- `app` (required)
- `render({ request, page })` to override page rendering
- `actionPath`
- `hydrationGlobalName`
- `onError(error)` to map render errors to `Response`

## Minimal example

```ts
import { createRequestHandler } from "@effect-react/react/server";
import { app } from "./app";

export const handler = createRequestHandler({
  app,
  actionPath: "/_actions",
});
```
