import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const threshold = Number.parseInt(process.env["BUNDLE_MAX_BYTES"] ?? "400000", 10);

if (!Number.isFinite(threshold) || threshold < 1) {
  throw new Error("BUNDLE_MAX_BYTES must be a positive integer");
}

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(full);
      files.push(...nested);
      continue;
    }
    files.push(full);
  }
  return files;
};

const files = await collectFiles(distDir);
const targets = files.filter((file) => file.endsWith(".js") || file.endsWith(".cjs"));

let totalBytes = 0;
for (const file of targets) {
  const fileStat = await stat(file);
  totalBytes += fileStat.size;
}

if (totalBytes > threshold) {
  throw new Error(`Bundle size regression: ${totalBytes} bytes > ${threshold} bytes`);
}

process.stdout.write(`bundle-size-ok ${totalBytes}/${threshold}\n`);
