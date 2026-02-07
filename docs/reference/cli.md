# CLI

## Purpose

Scaffold and run effect-react applications from the terminal.

## Imports

```ts
import { runCli } from "@effect-react/react/cli";
```

## Commands

- `effect-react new <name>`
- `effect-react dev`
- `effect-react build`
- `effect-react start`

## Key APIs

- entrypoint: `runCli`
- template resolver: `resolveStarterTemplate`
- process helpers: `runProcess`, `runProcessExpectSuccess`

## Behavior Guarantees

- commands delegate to Vite-compatible dev/build/start flows.
- starter template output is deterministic for supported template names.

## Failure Model

- process and scaffold failures are returned through typed CLI error unions.

## Minimal Example

```bash
effect-react new my-app
effect-react dev --cwd my-app
```

## Related

- [`framework.md`](framework.md)
