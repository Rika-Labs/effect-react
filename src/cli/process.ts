import { spawn } from "node:child_process";
import { Effect } from "effect";

export interface RunProcessOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly stdio?: "inherit" | "pipe";
}

export class ProcessSpawnError extends Error {
  constructor(
    readonly command: string,
    readonly causeValue: unknown,
  ) {
    super(`Failed to spawn command: ${command}`);
    this.name = "ProcessSpawnError";
  }
}

export class ProcessExitError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number,
  ) {
    super(`Command exited with non-zero code (${String(exitCode)}): ${command}`);
    this.name = "ProcessExitError";
  }
}

export type ProcessError = ProcessSpawnError | ProcessExitError;

export const runProcess = (
  options: RunProcessOptions,
): Effect.Effect<number, ProcessError, never> =>
  Effect.async<number, ProcessError>((resume) => {
    const child = spawn(options.command, [...options.args], {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      stdio: options.stdio ?? "inherit",
    });

    const onError = (error: unknown) => {
      resume(Effect.fail(new ProcessSpawnError(options.command, error)));
    };
    const onClose = (code: number | null) => {
      resume(Effect.succeed(code ?? 1));
    };

    child.once("error", onError);
    child.once("close", onClose);

    return Effect.sync(() => {
      child.off("error", onError);
      child.off("close", onClose);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    });
  });

export const runProcessExpectSuccess = (
  options: RunProcessOptions,
): Effect.Effect<void, ProcessError, never> =>
  Effect.flatMap(runProcess(options), (exitCode) =>
    exitCode === 0
      ? Effect.void
      : Effect.fail(new ProcessExitError([options.command, ...options.args].join(" "), exitCode)),
  );
