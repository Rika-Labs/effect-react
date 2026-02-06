import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";

interface ExportTarget {
  readonly types?: string;
  readonly import?: string;
  readonly require?: string;
}

interface PackageJson {
  readonly exports?: Record<string, ExportTarget | string>;
}

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");

const readUtf8File = (file: string) =>
  Effect.tryPromise({
    try: () => readFile(file, "utf8"),
    catch: (cause) => new Error(`Failed to read '${file}': ${String(cause)}`),
  });

const ensurePathExists = (file: string) =>
  Effect.tryPromise({
    try: () => access(file),
    catch: (cause) => new Error(`Missing path '${file}': ${String(cause)}`),
  });

const parsePackageJson = (raw: string) =>
  Effect.try({
    try: () => JSON.parse(raw) as PackageJson,
    catch: (cause) => new Error(`Invalid package.json: ${String(cause)}`),
  });

const targetsFromExports = (
  exportsMap: Record<string, ExportTarget | string>,
): readonly string[] => {
  const targets: string[] = [];
  for (const value of Object.values(exportsMap)) {
    if (typeof value === "string") {
      targets.push(value);
      continue;
    }
    if (value.import !== undefined) {
      targets.push(value.import);
    }
    if (value.require !== undefined) {
      targets.push(value.require);
    }
    if (value.types !== undefined) {
      targets.push(value.types);
    }
  }
  return targets;
};

const program = Effect.gen(function* () {
  const packageJsonRaw = yield* readUtf8File(packageJsonPath);
  const packageJson = yield* parsePackageJson(packageJsonRaw);
  const exportsMap = packageJson.exports;

  if (exportsMap === undefined) {
    return yield* Effect.fail(new Error("package.json must define exports"));
  }

  const targets = targetsFromExports(exportsMap);
  const missing: string[] = [];

  for (const target of targets) {
    const fullPath = path.join(root, target);
    const exists = yield* Effect.match(ensurePathExists(fullPath), {
      onFailure: () => false,
      onSuccess: () => true,
    });
    if (!exists) {
      missing.push(target);
    }
  }

  if (missing.length > 0) {
    return yield* Effect.fail(new Error(`Missing export targets:\n${missing.join("\n")}`));
  }

  yield* Effect.sync(() => {
    process.stdout.write(`exports-ok ${targets.length}\n`);
  });
});

void Effect.runPromise(program).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
