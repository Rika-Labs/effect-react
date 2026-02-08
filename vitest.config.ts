import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 95,
        statements: 95,
      },
      include: [
        "src/framework/**/*.ts",
        "src/framework-vite/**/*.ts",
        "src/config/**/*.ts",
        "src/server/**/*.ts",
        "src/client/**/*.ts",
        "src/testing/**/*.ts",
        "src/state/**/*.ts",
        "src/state/**/*.tsx",
        "src/query/**/*.ts",
        "src/query/**/*.tsx",
        "src/router/**/*.ts",
        "src/router/**/*.tsx",
        "src/form/**/*.ts",
        "src/form/**/*.tsx",
        "src/grid/**/*.ts",
        "src/grid/**/*.tsx",
        "src/virtual/**/*.ts",
        "src/virtual/**/*.tsx",
        "src/realtime/**/*.ts",
        "src/realtime/**/*.tsx",
        "src/devtools/**/*.ts",
        "src/devtools/**/*.tsx",
        "src/kernel/**/*.ts",
        "src/boundary/**/*.ts",
        "src/data/**/*.ts",
        "src/navigation/**/*.ts",
        "src/actions/**/*.ts",
        "src/render/**/*.ts",
        "src/react/**/*.ts",
        "src/react/**/*.tsx"
      ],
      exclude: ["src/**/index.ts", "src/**/types.ts"]
    }
  }
});
