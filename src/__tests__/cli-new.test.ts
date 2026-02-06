import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { runNewCommand, scaffoldStarterProject } from "../cli/commands/new";

const tempRoots: string[] = [];

const createTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "effect-react-cli-new-"));
  tempRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("cli new", () => {
  it("scaffolds the bun starter with deterministic files", async () => {
    const root = await createTempRoot();
    const result = await Effect.runPromise(
      scaffoldStarterProject({
        name: "demo-app",
        cwd: root,
      }),
    );

    expect(result.template).toBe("bun");
    expect(result.fileCount).toBeGreaterThan(0);

    const packageJsonPath = path.join(result.targetPath, "package.json");
    const viteConfigPath = path.join(result.targetPath, "vite.config.ts");
    const appPath = path.join(result.targetPath, "src/App.tsx");

    await expect(stat(packageJsonPath)).resolves.toBeDefined();
    await expect(stat(viteConfigPath)).resolves.toBeDefined();
    await expect(stat(appPath)).resolves.toBeDefined();

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
      readonly dependencies: Readonly<Record<string, string>>;
    };
    expect(packageJson.scripts["dev"]).toBe("effect-react dev");
    expect(packageJson.dependencies["effect"]).toBeDefined();
  });

  it("fails on invalid project names", async () => {
    const root = await createTempRoot();
    const exit = await Effect.runPromiseExit(
      scaffoldStarterProject({
        name: "bad/name",
        cwd: root,
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value).toEqual({
          _tag: "invalid_project_name",
          name: "bad/name",
          message:
            "Project name must start with an alphanumeric character and contain only letters, numbers, '.', '-', or '_'",
        });
      }
    }
  });

  it("fails when the target directory already exists", async () => {
    const root = await createTempRoot();
    const existing = path.join(root, "demo-app");
    await mkdir(existing, { recursive: true });

    const exit = await Effect.runPromiseExit(
      scaffoldStarterProject({
        name: "demo-app",
        cwd: root,
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value).toEqual({
          _tag: "target_exists",
          targetPath: existing,
        });
      }
    }
  });

  it("runs the new command effect wrapper", async () => {
    const root = await createTempRoot();
    await expect(
      Effect.runPromise(
        runNewCommand({
          name: "quick-app",
          cwd: root,
          template: "bun",
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
