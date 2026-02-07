# Mental Model

## Core Idea

effect-react is not only a hook bundle. It is a runtime model for React applications that use Effect as the base abstraction for async, failure, and resource safety.

## Layers

1. **Runtime layer**: `EffectProvider` supplies the managed runtime.
2. **Application primitives**: query, mutation, forms, state, routing, streams.
3. **Server and framework layer**: route handlers, server actions, request pipelines, SSR orchestration.
4. **Operational controls**: scheduling, policies, concurrency, persistence.

## Failure Model

- Effect failures are represented in typed channels (`E`)
- defects and interruptions are separated from domain failures
- React surfaces this via structured result states and Effect-aware boundaries

## Cancellation Model

- in-flight work is canceled when lifecycle scope ends
- policies (debounce/throttle), queues, and loaders cooperate with cancellation

## Composition Model

- modules can be adopted independently through subpath imports
- all modules compose through the same runtime and Effect types

## Expected Result

You can reason about client and server execution with one set of Effect concepts.
