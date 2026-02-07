import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type LinkRef = {
  readonly file: string;
  readonly line: number;
  readonly url: string;
  readonly isImage: boolean;
};

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const docsRoot = resolve(repoRoot, "docs");
const markdownFiles = [resolve(repoRoot, "README.md"), ...collectMarkdownFiles(docsRoot)];

const allRefs: LinkRef[] = markdownFiles.flatMap(collectLinksFromFile);
const internalFailures: string[] = [];
const externalRefs = new Map<string, LinkRef[]>();

for (const ref of allRefs) {
  if (shouldSkip(ref.url)) {
    continue;
  }

  if (isExternal(ref.url)) {
    const refs = externalRefs.get(ref.url) ?? [];
    refs.push(ref);
    externalRefs.set(ref.url, refs);
    continue;
  }

  const resolved = resolveInternalPath(ref.file, ref.url);
  if (resolved === undefined) {
    continue;
  }

  const candidates = [resolved, `${resolved}.md`, resolve(resolved, "README.md")];
  if (!candidates.some((candidate) => existsSync(candidate))) {
    internalFailures.push(formatFailure(ref, `missing target: ${ref.url}`));
  }
}

const externalFailures = await checkExternalUrls(externalRefs);
const failures = [...internalFailures, ...externalFailures];

if (failures.length > 0) {
  process.stderr.write("\nBroken documentation links found:\n\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Checked ${allRefs.length} links across ${markdownFiles.length} files (${externalRefs.size} external URLs).\n`,
);

function collectMarkdownFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...collectMarkdownFiles(path));
      continue;
    }

    if (stats.isFile() && entry.endsWith(".md")) {
      files.push(path);
    }
  }

  return files;
}

function collectLinksFromFile(file: string): LinkRef[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const refs: LinkRef[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const regex = /(!?)\[[^\]]*\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null = regex.exec(line);

    while (match) {
      const isImage = (match[1] ?? "") === "!";
      const raw = (match[2] ?? "").trim();
      const url = normalizeMarkdownLink(raw);
      if (url.length > 0) {
        refs.push({
          file,
          line: i + 1,
          url,
          isImage,
        });
      }
      match = regex.exec(line);
    }
  }

  return refs;
}

function normalizeMarkdownLink(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<")) {
    const closing = trimmed.indexOf(">", 1);
    if (closing > 1) {
      return trimmed.slice(1, closing);
    }
  }

  const firstToken = trimmed.split(/\s+/, 1)[0] ?? "";
  return firstToken.replace(/^['"]|['"]$/g, "");
}

function shouldSkip(url: string): boolean {
  return (
    url.length === 0 ||
    url.startsWith("#") ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("javascript:") ||
    url.startsWith("data:")
  );
}

function isExternal(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function resolveInternalPath(sourceFile: string, url: string): string | undefined {
  const withoutFragment = url.split("#", 1)[0] ?? "";
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";

  if (withoutQuery.length === 0) {
    return undefined;
  }

  if (withoutQuery.startsWith("/")) {
    return resolve(repoRoot, withoutQuery.slice(1));
  }

  return resolve(dirname(sourceFile), withoutQuery);
}

function formatFailure(ref: LinkRef, detail: string): string {
  const relative = ref.file.replace(`${repoRoot}/`, "");
  return `${relative}:${ref.line} -> ${detail}`;
}

async function checkExternalUrls(urls: Map<string, LinkRef[]>): Promise<string[]> {
  const entries = [...urls.entries()];
  if (entries.length === 0) {
    return [];
  }

  const failures: string[] = [];
  const concurrency = 8;
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (cursor < entries.length) {
      const current = entries[cursor];
      cursor += 1;

      if (!current) {
        continue;
      }

      const [url, refs] = current;
      const error = await validateExternalUrl(url);
      if (error === undefined) {
        continue;
      }

      for (const ref of refs) {
        failures.push(formatFailure(ref, `${url} (${error})`));
      }
    }
  });

  await Promise.all(workers);
  return failures;
}

async function validateExternalUrl(url: string): Promise<string | undefined> {
  const attempts = 2;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const head = await fetchStatus(url, "HEAD");

    if (head.ok) {
      return undefined;
    }

    const shouldTryGet = head.status === 405 || head.status === 501 || head.status === undefined;
    if (shouldTryGet) {
      const get = await fetchStatus(url, "GET");
      if (get.ok) {
        return undefined;
      }

      if (attempt < attempts && shouldRetry(get.status)) {
        continue;
      }

      return get.error ?? `HTTP ${get.status ?? "unknown"}`;
    }

    if (attempt < attempts && shouldRetry(head.status)) {
      continue;
    }

    return head.error ?? `HTTP ${head.status ?? "unknown"}`;
  }

  return "request failed";
}

async function fetchStatus(
  url: string,
  method: "HEAD" | "GET",
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "effect-react-doc-link-check",
      },
    });

    if (response.status >= 200 && response.status < 400) {
      return { ok: true, status: response.status };
    }

    return { ok: false, status: response.status };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: "unknown error" };
  }
}

function shouldRetry(status: number | undefined): boolean {
  if (status === undefined) {
    return true;
  }

  return status === 408 || status === 425 || status === 429 || status >= 500;
}
