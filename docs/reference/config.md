# `@rika-labs/effect-react/config`

Typed framework configuration.

## APIs

- `defineConfig(config)`
- `resolveConfig(config?)`

## Default resolved config

```ts
{
  appDir: "app",
  adapters: ["node", "bun"],
  ssr: { streaming: true },
  cache: {
    defaultPolicy: "no-store",
    routeSegmentDefaults: "explicit",
  },
  strict: {
    boundarySchemas: true,
    typedErrors: true,
  },
}
```

`createApp({ config })` uses `resolveConfig` internally.
