import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";

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
const packageJsonRaw = await readFile(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw) as PackageJson;
const exportsMap = packageJson.exports;

if (exportsMap === undefined) {
  throw new Error("package.json must define exports");
}

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

const missing: string[] = [];
for (const target of targets) {
  const fullPath = path.join(root, target);
  try {
    await access(fullPath);
  } catch {
    missing.push(target);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing export targets:\n${missing.join("\n")}`);
}

process.stdout.write(`exports-ok ${targets.length}\n`);
