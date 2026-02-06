import { defineConfig } from "tsup";

const entries = [
  "src/index.ts",
  "src/adapters/index.ts",
  "src/adapters/bun/index.ts",
  "src/adapters/node/index.ts",
  "src/async/index.ts",
  "src/browser/index.ts",
  "src/concurrency/index.ts",
  "src/cli/index.ts",
  "src/devtools/index.ts",
  "src/error-boundary/index.ts",
  "src/events/index.ts",
  "src/forms/index.ts",
  "src/framework/index.ts",
  "src/framework/vite.ts",
  "src/mutation/index.ts",
  "src/optimistic/index.ts",
  "src/persistence/index.ts",
  "src/policies/index.ts",
  "src/provider/index.ts",
  "src/query/index.ts",
  "src/router/index.ts",
  "src/scheduling/index.ts",
  "src/server/index.ts",
  "src/ssr/index.ts",
  "src/state/index.ts",
  "src/streams/index.ts",
  "src/table/index.ts",
  "src/url-state/index.ts",
  "src/virtual/index.ts",
];

const internalEntries = [
  "src/internal/duration.ts",
  "src/internal/effectRunner.ts",
  "src/internal/externalStore.ts",
  "src/internal/invariant.ts",
  "src/internal/keyHash.ts",
  "src/internal/pathUtils.ts",
  "src/internal/runtimeContext.ts",
];

const external = [
  "react",
  "react-dom",
  "effect",
  "@effect/cli",
  "@effect/platform",
  "@effect/platform-node",
  "typescript",
];

export default defineConfig([
  {
    entry: entries,
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: true,
    external,
  },
  {
    entry: entries.filter((entry) => entry !== "src/index.ts").concat(internalEntries),
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
    external,
  },
  {
    entry: { index: "src/index.cjs.ts" },
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
    external,
    bundle: false,
    splitting: false,
  },
]);
