import { defineConfig } from "tsup";

const entries = [
  "src/index.ts",
  "src/framework/index.ts",
  "src/framework-vite/index.ts",
  "src/config/index.ts",
  "src/server/index.ts",
  "src/client/index.ts",
  "src/testing/index.ts",
  "src/state/index.ts",
  "src/query/index.ts",
  "src/router/index.ts",
  "src/form/index.ts",
  "src/grid/index.ts",
  "src/virtual/index.ts",
  "src/realtime/index.ts",
  "src/devtools/index.ts",
];

const external = ["react", "react-dom", "effect"];

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
    entry: entries,
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: false,
    external,
  },
]);
