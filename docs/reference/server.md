# Server

## Purpose

Define typed server actions, route handlers, decoding, and request pipelines.

## Imports

```ts
import {
  defineServerAction,
  useServerAction,
  defineRouteHandler,
  createRequestPipeline,
} from "@effect-react/react/server";
```

## Key APIs

- server actions: `defineServerAction`, `callServerAction`, `callServerActionByName`
- action transports/dispatch: `createServerActionDispatcher`, `createInMemoryServerActionTransport`, `createFetchServerActionTransport`
- route handlers: `defineRouteHandler`, `createRouteRequestHandlerEffect`
- request context and decoding: `RequestContext`, `decodeJsonBodyEffect`, `decodeActionRequestPayload`
- HTTP helpers: `createServerActionHttpHandlerEffect`, `createRequestScopedServerActionHttpHandlerEffect`
- request orchestration: `createRequestPipeline`

## Behavior Guarantees

- action input/output contracts are explicit and serializable.
- request-scoped context can be layered into Effect execution.

## Failure Model

- transport, validation, and defect errors are represented by dedicated error types.
- server boundary errors can be encoded/decoded through explicit codecs.

## Minimal Example

```ts
import { Effect } from "effect";
import { defineServerAction } from "@effect-react/react/server";

export const ping = defineServerAction({
  name: "ping",
  handler: ({ message }: { message: string }) => Effect.succeed({ message }),
});
```

## Related

- [`framework.md`](framework.md)
- [`ssr.md`](ssr.md)
