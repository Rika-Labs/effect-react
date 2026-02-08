import { defineConfig } from "tsup";

const entries = [
  "src/index.ts",
  "src/framework/index.ts",
  "src/framework-vite/index.ts",
  "src/config/index.ts",
  "src/server/index.ts",
  "src/client/index.ts",
  "src/testing/index.ts",
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
