# Why effect-react

## Who This Is For

Teams building React apps that want Effect semantics across client and server.

## The Problem It Solves

Most React stacks combine unrelated tools for query caching, router state, server actions, and background work. Each layer has different error handling and cancellation semantics.

`effect-react` gives you one Effect runtime and one model for:

- data loading and mutations
- route loading and server actions
- SSR hydration and request pipelines
- scheduling, retry, and concurrency controls

## What You Get

- Typed error channels (`E`) through hooks and server boundaries
- Automatic cancellation of in-flight Effect work on unmount and lifecycle transitions
- Tree-shakeable subpath modules so you only ship what you use
- Full-stack composition APIs for file route/action discovery and SSR orchestration

## What You Trade Off

- The package is pre-1.0 (`0.1.x`), so APIs can evolve
- You need Effect literacy on the frontend team
- You compose runtime wiring explicitly instead of relying on framework magic

## Expected Result

After adopting effect-react, frontend and backend teams can share one Effect-first programming model for failures, resource safety, and async orchestration.
