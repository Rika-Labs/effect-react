import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/__tests__/v1/**/*.test.ts",
      "src/__tests__/v1/**/*.test.tsx",
      "src/__tests__/framework/**/*.test.ts",
      "src/__tests__/framework/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/framework/**/*.ts",
        "src/framework-vite/**/*.ts",
        "src/config/**/*.ts",
        "src/server/**/*.ts",
        "src/client/**/*.ts",
        "src/testing/**/*.ts",
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
