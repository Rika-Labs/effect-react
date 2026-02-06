import { runProcessExpectSuccess } from "../process";

export interface StartCommandOptions {
  readonly cwd?: string;
  readonly config?: string;
  readonly host?: string;
  readonly port?: number;
}

export const createViteStartArgs = (options: Omit<StartCommandOptions, "cwd"> = {}): string[] => {
  const args = ["x", "vite", "preview"];
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

export const runStartCommand = (options: StartCommandOptions = {}) => {
  const args = createViteStartArgs(options);

  return runProcessExpectSuccess({
    command: "bun",
    args,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
};
