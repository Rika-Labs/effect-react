import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { NodeContext } from "@effect/platform-node";
import { runCli } from "../cli";
import { createViteBuildArgs, createViteDevArgs, createViteStartArgs } from "../cli/commands";
import {
  ProcessExitError,
  ProcessSpawnError,
  runProcess,
  runProcessExpectSuccess,
} from "../cli/process";

describe("cli smoke", () => {
  it("builds vite command args deterministically", () => {
    expect(createViteDevArgs()).toEqual(["x", "vite", "dev"]);
    expect(createViteDevArgs({ config: "vite.config.ts", host: "127.0.0.1", port: 3001 })).toEqual([
      "x",
      "vite",
      "dev",
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "3001",
    ]);

    expect(createViteBuildArgs({ mode: "production" })).toEqual([
      "x",
      "vite",
      "build",
      "--mode",
      "production",
    ]);
    expect(createViteStartArgs({ host: "0.0.0.0", port: 4173 })).toEqual([
      "x",
      "vite",
      "preview",
      "--host",
      "0.0.0.0",
      "--port",
      "4173",
    ]);
  });

  it("executes process effects and reports exit failures", async () => {
    const zero = await Effect.runPromise(
      runProcess({ command: "node", args: ["-e", "process.exit(0)"] }),
    );
    expect(zero).toBe(0);

    const nonZero = await Effect.runPromise(
      runProcess({ command: "node", args: ["-e", "process.exit(2)"] }),
    );
    expect(nonZero).toBe(2);

    const exit = await Effect.runPromiseExit(
      runProcessExpectSuccess({ command: "node", args: ["-e", "process.exit(3)"] }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ProcessExitError);
    }

    await expect(
      Effect.runPromise(
        runProcessExpectSuccess({ command: "node", args: ["-e", "process.exit(0)"] }),
      ),
    ).resolves.toBeUndefined();

    const spawnFailure = await Effect.runPromiseExit(
      runProcess({ command: "definitely-not-a-real-command", args: [] }),
    );
    expect(Exit.isFailure(spawnFailure)).toBe(true);
    if (Exit.isFailure(spawnFailure)) {
      expect(Cause.squash(spawnFailure.cause)).toBeInstanceOf(ProcessSpawnError);
    }
  });

  it("supports effect-cli built-in help paths", async () => {
    const rootHelp = await Effect.runPromiseExit(
      runCli(["node", "effect-react", "--help"]).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Exit.isSuccess(rootHelp)).toBe(true);

    const devHelp = await Effect.runPromiseExit(
      runCli(["node", "effect-react", "dev", "--help"]).pipe(Effect.provide(NodeContext.layer)),
    );
    expect(Exit.isSuccess(devHelp)).toBe(true);
  });

  it("builds dev args with no options", () => {
    expect(createViteDevArgs()).toEqual(["x", "vite", "dev"]);
  });

  it("builds dev args with config only", () => {
    expect(createViteDevArgs({ config: "custom.config.ts" })).toEqual([
      "x",
      "vite",
      "dev",
      "--config",
      "custom.config.ts",
    ]);
  });

  it("builds dev args with host only", () => {
    expect(createViteDevArgs({ host: "0.0.0.0" })).toEqual([
      "x",
      "vite",
      "dev",
      "--host",
      "0.0.0.0",
    ]);
  });

  it("builds dev args with port only", () => {
    expect(createViteDevArgs({ port: 8080 })).toEqual(["x", "vite", "dev", "--port", "8080"]);
  });

  it("builds build args with no options", () => {
    expect(createViteBuildArgs()).toEqual(["x", "vite", "build"]);
  });

  it("builds build args with config", () => {
    expect(createViteBuildArgs({ config: "vite.prod.ts" })).toEqual([
      "x",
      "vite",
      "build",
      "--config",
      "vite.prod.ts",
    ]);
  });

  it("builds start args with no options", () => {
    expect(createViteStartArgs()).toEqual(["x", "vite", "preview"]);
  });

  it("builds start args with config", () => {
    expect(createViteStartArgs({ config: "vite.preview.ts" })).toEqual([
      "x",
      "vite",
      "preview",
      "--config",
      "vite.preview.ts",
    ]);
  });

  it("ProcessSpawnError and ProcessExitError have correct names", () => {
    const spawn = new ProcessSpawnError("cmd", new Error("oops"));
    expect(spawn.name).toBe("ProcessSpawnError");
    expect(spawn.command).toBe("cmd");
    expect(spawn.message).toContain("cmd");

    const exit = new ProcessExitError("cmd arg", 1);
    expect(exit.name).toBe("ProcessExitError");
    expect(exit.exitCode).toBe(1);
    expect(exit.message).toContain("1");
  });

  it("runs process with custom cwd option", async () => {
    const code = await Effect.runPromise(
      runProcess({ command: "node", args: ["-e", "process.exit(0)"], cwd: "/tmp" }),
    );
    expect(code).toBe(0);
  });
});
