# Migrate from Next.js

This guide maps common Next.js app patterns to `effect-react` primitives.

## Mental model

- Next.js route handlers and server actions map to `defineRouteHandler` and `defineServerAction`.
- File discovery is handled by `effectReactVitePlugin()`.
- Framework composition is explicit with `defineApp` / `defineAppFromManifests`.
- SSR hydration uses `app.createSsrHandler()` with typed Effect failures.

## API mapping

| Next.js pattern                       | effect-react replacement                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| `app/*` route files                   | `src/routes/*` discovered by `virtual:effect-react/routes`           |
| Server Actions (`"use server"`)       | `defineServerAction` + `callServerAction` / `callServerActionByName` |
| Route handlers (`GET`, `POST`)        | `defineRouteHandler`                                                 |
| Middleware chain                      | `RouteMiddleware`                                                    |
| Data hydration in server/client split | `dehydrateFrameworkState` / `hydrateFrameworkState`                  |
| App bootstrap                         | `defineAppFromManifests`                                             |

## Typical migration steps

1. Move route files to `src/routes` and keep URL shape in filenames.
2. Move action logic to `defineServerAction` with explicit codecs and schemas.
3. Add `effectReactVitePlugin()` to `vite.config.ts`.
4. Compose runtime app via `defineAppFromManifests`.
5. Replace ad-hoc server rendering helpers with `app.createSsrHandler`.
6. Validate with `bun run check`.

## Incremental migration strategy

1. Start with route/action discovery only.
2. Introduce loaders (`defineRouteLoader`) and hydration state.
3. Move SSR endpoint to the framework orchestrator.
4. Replace Promise-heavy internals with Effect programs at boundaries.

See also:

- `docs/parity/MIGRATION-MAP.md`
- `docs/parity/PARITY-SOURCE-MAP.md`
