import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";

const root = process.cwd();
const distDir = path.join(root, "dist");
const threshold = Number.parseInt(process.env["BUNDLE_MAX_BYTES"] ?? "800000", 10);

const readDirectory = (directory: string) =>
  Effect.tryPromise({
    try: () => readdir(directory, { withFileTypes: true }),
    catch: (cause) => new Error(`Failed to read directory '${directory}': ${String(cause)}`),
  });

const readFileStat = (file: string) =>
  Effect.tryPromise({
    try: () => stat(file),
    catch: (cause) => new Error(`Failed to stat file '${file}': ${String(cause)}`),
  });

const collectFiles = (startDirectory: string): Effect.Effect<readonly string[], Error> =>
  Effect.gen(function* () {
    const directories: string[] = [startDirectory];
    const files: string[] = [];

    while (directories.length > 0) {
      const directory = directories.pop();
      if (directory === undefined) {
        continue;
      }
      const entries = yield* readDirectory(directory);
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          directories.push(fullPath);
          continue;
        }
        files.push(fullPath);
      }
    }

    return files;
  });

const program = Effect.gen(function* () {
  if (!Number.isFinite(threshold) || threshold < 1) {
    return yield* Effect.fail(new Error("BUNDLE_MAX_BYTES must be a positive integer"));
  }

  const files = yield* collectFiles(distDir);
  const targets = files.filter((file) => file.endsWith(".js") || file.endsWith(".cjs"));
  const stats = yield* Effect.forEach(targets, (file) => readFileStat(file), { discard: false });
  const totalBytes = stats.reduce((sum, fileStat) => sum + fileStat.size, 0);

  if (totalBytes > threshold) {
    return yield* Effect.fail(
      new Error(`Bundle size regression: ${totalBytes} bytes > ${threshold} bytes`),
    );
  }

  yield* Effect.sync(() => {
    process.stdout.write(`bundle-size-ok ${totalBytes}/${threshold}\n`);
  });
});

void Effect.runPromise(program).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
