import { runProcessExpectSuccess } from "../process";

export interface BuildCommandOptions {
  readonly cwd?: string;
  readonly config?: string;
  readonly mode?: string;
}

export const createViteBuildArgs = (options: Omit<BuildCommandOptions, "cwd"> = {}): string[] => {
  const args = ["x", "vite", "build"];
  if (options.config !== undefined) {
    args.push("--config", options.config);
  }
  if (options.mode !== undefined) {
    args.push("--mode", options.mode);
  }
  return args;
};

export const runBuildCommand = (options: BuildCommandOptions = {}) => {
  const args = createViteBuildArgs(options);

  return runProcessExpectSuccess({
    command: "bun",
    args,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
  });
};
