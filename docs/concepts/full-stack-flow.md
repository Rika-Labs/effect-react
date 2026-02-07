# Full-Stack Request Flow

## Goal

Describe the end-to-end path from incoming request to hydrated client state.

## Flow

1. **Discovery/build time**
   - `effectReactVitePlugin()` discovers route and action modules.
2. **Server composition**
   - framework app is created from manifests and runtime.
3. **Request handling**
   - request pipeline dispatches route handlers and server action handlers.
4. **SSR render**
   - Effect-driven SSR produces HTML and hydration payload.
5. **Client hydration**
   - query/framework hydration state is decoded and loaded.
6. **Post-hydration runtime**
   - client hooks continue using the same query cache/runtime semantics.

## Key Contracts

- Route definitions and loaders are typed
- Server action wire format is explicit
- Hydration payload has versioned structure

## Failure Modes to Plan For

- decode failures for malformed action payloads
- route/action registry mismatches during deploy transitions
- hydration state version mismatches

## Expected Result

A deterministic request pipeline where server and client share typed contracts and runtime behavior.
