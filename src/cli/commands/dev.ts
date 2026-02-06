import { runProcessExpectSuccess } from "../process";

export interface DevCommandOptions {
  readonly cwd?: string;
  readonly config?: string;
  readonly host?: string;
  readonly port?: number;
}

export const createViteDevArgs = (options: Omit<DevCommandOptions, "cwd"> = {}): string[] => {
  const args = ["x", "vite", "dev"];
  if (options.config !== undefined) {
    args.push("--config", options.config);
  }
  if (options.host !== undefined) {
    args.push("--host", options.host);
  }
  if (options.port !== undefined) {
    args.push("--port", String(options.port));
  }
  return args;
};

export const runDevCommand = (options: DevCommandOptions = {}) => {
  const args = createViteDevArgs(options);

  return runProcessExpectSuccess({
    command: "bun",
    args,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
};
