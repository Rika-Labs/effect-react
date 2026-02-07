# Browser Sources

## Purpose

Headless browser-state sources (clipboard, geolocation, permissions, network, visibility).

## Imports

```ts
import {
  createClipboardSource,
  createGeolocationSource,
  createPermissionsSource,
  createNetworkStatusSource,
  createVisibilitySource,
} from "@effect-react/react/browser";
```

## Key APIs

- source contract: `HeadlessSource<T>`
- clipboard: `createClipboardSource`
- geolocation: `createGeolocationSource`
- permissions: `createPermissionsSource`
- network: `createNetworkStatusSource`
- visibility: `createVisibilitySource`

## Behavior Guarantees

- each source provides a consistent subscribe/getSnapshot lifecycle.
- browser global access is isolated inside source constructors.

## Failure Model

- permission-denied or unsupported-browser states are represented in source snapshots.

## Minimal Example

```ts
import { createNetworkStatusSource } from "@effect-react/react/browser";

const source = createNetworkStatusSource();
const unsubscribe = source.subscribe(() => {
  console.log(source.getSnapshot().online);
});
unsubscribe();
```

## Related

- [`state.md`](state.md)
- [`streams.md`](streams.md)
