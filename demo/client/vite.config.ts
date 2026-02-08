import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { effectReactVitePlugin } from "@effect-react/react/framework/vite";

export default defineConfig({
  plugins: [react(), effectReactVitePlugin({ appDir: "app" })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
});
