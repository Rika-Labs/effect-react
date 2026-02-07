# Adapters

## Purpose

Run composed request handlers on Bun or Node runtimes.

## Imports

```ts
import { serveWithBun, serveWithNode } from "@effect-react/react/adapters";
```

## Key APIs

- runtime servers: `serveWithBun`, `serveWithNode`
- contract types: `AdapterApplication`, `HandlerSource`, `AdapterServeOptions`, `AdapterServer`
- conversion helper: `toRequestHandler`
- error type: `BunAdapterUnavailableError`

## Behavior Guarantees

- adapter layer normalizes Promise-based and Effect-based request handlers.
- lifecycle methods (`close`, `onListen`) are explicit on adapter server handles.

## Failure Model

- adapter startup/runtime errors surface through Effect failures or adapter error types.

## Minimal Example

```ts
import { serveWithNode } from "@effect-react/react/adapters";

const server = serveWithNode({ fetch: async () => new Response("ok") }, { port: 3000 });
```

## Related

- [`framework.md`](framework.md)
- [`server.md`](server.md)
