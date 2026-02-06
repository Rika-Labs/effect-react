export type StarterTemplateName = "bun";

export interface StarterTemplateFile {
  readonly path: string;
  readonly content: string;
}

export interface StarterTemplate {
  readonly name: StarterTemplateName;
  readonly description: string;
  readonly files: readonly StarterTemplateFile[];
}

const asJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const createBunStarterTemplate = (projectName: string): StarterTemplate => ({
  name: "bun",
  description: "Bun-first Vite + Effect + React starter with effect-react framework wiring",
  files: [
    {
      path: "package.json",
      content: asJson({
        name: projectName,
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "effect-react dev",
          build: "effect-react build",
          start: "effect-react start",
        },
        dependencies: {
          "@effect-react/react": "^0.1.0",
          effect: "^3.19.16",
          react: "^19.1.1",
          "react-dom": "^19.1.1",
          vite: "^7.3.1",
        },
        devDependencies: {
          "@types/react": "^19.1.8",
          "@types/react-dom": "^19.1.6",
          "@vitejs/plugin-react": "^5.1.0",
          typescript: "^5.9.2",
        },
      }),
    },
    {
      path: "tsconfig.json",
      content: asJson({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          jsx: "react-jsx",
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          types: ["vite/client"],
        },
        include: ["src", "vite.config.ts"],
      }),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { effectReactVitePlugin } from "@effect-react/react/framework/vite";

export default defineConfig({
  plugins: [react(), effectReactVitePlugin()],
});
`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "src/main.tsx",
      content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root container");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    },
    {
      path: "src/App.tsx",
      content: `import { Effect, Layer, ManagedRuntime } from "effect";
import { EffectProvider, useQuery } from "@effect-react/react";
import "./styles.css";

const AppRuntime = ManagedRuntime.make(Layer.empty);

const nowQuery = Effect.sync(() => ({
  now: new Date().toISOString(),
}));

const Home = () => {
  const { data, status, refetch } = useQuery({
    key: ["starter", "time"],
    query: nowQuery,
  });

  return (
    <main className="page">
      <h1>effect-react starter</h1>
      <p>Status: {status}</p>
      <p>{data?.now ?? "Loading..."}</p>
      <button onClick={() => void refetch()}>Refresh</button>
    </main>
  );
};

export const App = () => (
  <EffectProvider runtime={AppRuntime}>
    <Home />
  </EffectProvider>
);
`,
    },
    {
      path: "src/styles.css",
      content: `:root {
  color-scheme: light;
  font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  background: radial-gradient(circle at top, #e5f6ff, #ffffff 60%);
  color: #0f172a;
}

.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 20px;
}

h1 {
  margin-bottom: 8px;
}

button {
  margin-top: 12px;
  border: 0;
  border-radius: 10px;
  background: #0ea5e9;
  color: #fff;
  padding: 10px 16px;
  cursor: pointer;
}
`,
    },
    {
      path: "src/env.d.ts",
      content: `/// <reference types="vite/client" />
`,
    },
    {
      path: "src/routes/index.ts",
      content: `import { defineRoute } from "@effect-react/react/router";

export const route = defineRoute({
  id: "home",
  path: "/",
});
`,
    },
    {
      path: "src/actions/ping.ts",
      content: `import { Effect } from "effect";
import { defineServerAction } from "@effect-react/react/server";

export const ping = defineServerAction({
  name: "starter.ping",
  run: (input: { readonly value: string }) =>
    Effect.succeed({
      echoed: input.value,
    }),
});
`,
    },
    {
      path: "README.md",
      content: `# ${projectName}

Bun-first starter scaffolded by \`effect-react new\`.

## Commands

- \`bun install\`
- \`bun run dev\`
- \`bun run build\`
- \`bun run start\`
`,
    },
  ],
});

export const resolveStarterTemplate = (
  template: StarterTemplateName,
  projectName: string,
): StarterTemplate => {
  switch (template) {
    case "bun":
      return createBunStarterTemplate(projectName);
  }
};
