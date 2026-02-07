# SSR

## Purpose

Hydrate and dehydrate query/framework state across server-rendered boundaries.

## Imports

```ts
import {
  dehydrate,
  hydrate,
  dehydrateFrameworkState,
  hydrateFrameworkState,
  createFrameworkHydrationScript,
} from "@effect-react/react/ssr";
```

## Key APIs

- query cache hydration: `dehydrate`, `hydrate`
- framework payload helpers: `dehydrateFrameworkState`, `hydrateFrameworkState`
- serialization helpers: `encodeFrameworkHydrationState`, `decodeFrameworkHydrationState`
- script/parsing helpers: `createFrameworkHydrationScript`, `parseFrameworkHydrationState`

## Behavior Guarantees

- hydration payload is versioned via framework hydration version constants.
- query cache state can be transferred deterministically across boundaries.

## Failure Model

- malformed hydration payloads decode to `undefined` or typed decode failures.

## Minimal Example

```ts
import { QueryCache } from "@effect-react/react/query";
import { dehydrateFrameworkState } from "@effect-react/react/ssr";

const cache = new QueryCache();
const state = dehydrateFrameworkState({ cache });
```

## Related

- [`query.md`](query.md)
- [`server.md`](server.md)
- [`framework.md`](framework.md)
