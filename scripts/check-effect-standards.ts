import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";

const ROOT = process.cwd();
const TARGET_DIRS = ["src", "scripts"] as const;
const SOURCE_EXTENSION = /\.(ts|tsx)$/;

const SKIP_FILES = new Set<string>([
  // This checker embeds forbidden tokens as regex literals.
  "scripts/check-effect-standards.ts",
  // Doc-link checker uses async/await for file I/O.
  "scripts/check-doc-links.ts",
]);

const ALLOW_ASYNC_AWAIT = new Set<string>([
  "src/framework/vite.ts", // Vite plugin hooks are async by platform contract.
]);

const ASYNC_AWAIT_PATTERN = /(^|[^\w.])async\s*(?:function\b|[\w(<])|\bawait\s+/;

const PROMISE_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "new Promise", pattern: /\bnew Promise\s*\(/g },
  { label: "Promise.resolve", pattern: /\bPromise\.resolve\s*\(/g },
  { label: "Promise.reject", pattern: /\bPromise\.reject\s*\(/g },
  { label: "Promise.all", pattern: /\bPromise\.all\s*\(/g },
  { label: "Promise.race", pattern: /\bPromise\.race\s*\(/g },
  { label: "Promise.any", pattern: /\bPromise\.any\s*\(/g },
];

const readDirectory = (directory: string) =>
  Effect.tryPromise({
    try: () => readdir(directory, { withFileTypes: true }),
    catch: (cause) => new Error(`Failed to read directory '${directory}': ${String(cause)}`),
  });

const readSourceFile = (file: string) =>
  Effect.tryPromise({
    try: () => readFile(file, "utf8"),
    catch: (cause) => new Error(`Failed to read source file '${file}': ${String(cause)}`),
  });

const collectFiles = (directory: string): Effect.Effect<readonly string[], Error> =>
  Effect.gen(function* () {
    const entries = yield* readDirectory(directory);
    const collected: string[] = [];
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = yield* collectFiles(absolute);
        collected.push(...nested);
        continue;
      }
      if (entry.isFile() && SOURCE_EXTENSION.test(entry.name)) {
        collected.push(absolute);
      }
    }
    return collected;
  });

const relativePath = (absolutePath: string): string =>
  path.relative(ROOT, absolutePath).split(path.sep).join("/");

const countMatches = (source: string, pattern: RegExp): number => {
  const matches = source.match(pattern);
  return matches === null ? 0 : matches.length;
};

const program = Effect.gen(function* () {
  const fileGroups = yield* Effect.forEach(
    TARGET_DIRS,
    (directory) => collectFiles(path.join(ROOT, directory)),
    { discard: false },
  );
  const files = fileGroups.flat();
  const failures: string[] = [];

  for (const file of files) {
    const relative = relativePath(file);
    if (relative.includes(".test.ts") || relative.includes(".test.tsx")) {
      continue;
    }
    if (SKIP_FILES.has(relative)) {
      continue;
    }

    const source = yield* readSourceFile(file);

    for (const { label, pattern } of PROMISE_PATTERNS) {
      const count = countMatches(source, pattern);
      if (count > 0) {
        failures.push(`${relative}: disallowed ${label} (${String(count)} match(es))`);
      }
    }

    if (!ALLOW_ASYNC_AWAIT.has(relative) && ASYNC_AWAIT_PATTERN.test(source)) {
      failures.push(`${relative}: async/await is only allowed at explicit boundary modules`);
    }
  }

  if (failures.length > 0) {
    return yield* Effect.fail(
      new Error(
        `Effect standards check failed:\n${failures.map((issue) => `- ${issue}`).join("\n")}`,
      ),
    );
  }

  yield* Effect.sync(() => {
    process.stdout.write(`effect-standards-ok ${String(files.length)} files\n`);
  });
});

void Effect.runPromise(program).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
