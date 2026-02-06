import { Args, Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { runBuildCommand, runDevCommand, runNewCommand, runStartCommand } from "./commands";
import type { ProcessError } from "./process";
import type { BuildCommandOptions } from "./commands/build";
import type { DevCommandOptions } from "./commands/dev";
import type { NewCommandError, NewCommandOptions } from "./commands/new";
import type { StartCommandOptions } from "./commands/start";

const cwdOption = Options.text("cwd").pipe(Options.optional);
const configOption = Options.text("config").pipe(Options.optional);
const modeOption = Options.text("mode").pipe(Options.optional);
const hostOption = Options.text("host").pipe(Options.optional);
const portOption = Options.integer("port").pipe(Options.optional);
const templateOption = Options.choice("template", ["bun"] as const).pipe(
  Options.withDefault("bun"),
);
const projectNameArg = Args.text({ name: "name" });

const toOptionalString = (value: Option.Option<string>): string | undefined =>
  Option.match(value, {
    onNone: () => undefined,
    onSome: (current) => current,
  });

const toOptionalNumber = (value: Option.Option<number>): number | undefined =>
  Option.match(value, {
    onNone: () => undefined,
    onSome: (current) => current,
  });

const assignIfDefined = <K extends string, V>(
  target: Partial<Record<K, V>>,
  key: K,
  value: V | undefined,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const toDevOptions = (
  cwd: Option.Option<string>,
  config: Option.Option<string>,
  host: Option.Option<string>,
  port: Option.Option<number>,
): DevCommandOptions => {
  const cwdValue = toOptionalString(cwd);
  const configValue = toOptionalString(config);
  const hostValue = toOptionalString(host);
  const portValue = toOptionalNumber(port);

  const options: {
    cwd?: string;
    config?: string;
    host?: string;
    port?: number;
  } = {};
  assignIfDefined(options, "cwd", cwdValue);
  assignIfDefined(options, "config", configValue);
  assignIfDefined(options, "host", hostValue);
  assignIfDefined(options, "port", portValue);
  return options;
};

const toBuildOptions = (
  cwd: Option.Option<string>,
  config: Option.Option<string>,
  mode: Option.Option<string>,
): BuildCommandOptions => {
  const cwdValue = toOptionalString(cwd);
  const configValue = toOptionalString(config);
  const modeValue = toOptionalString(mode);

  const options: {
    cwd?: string;
    config?: string;
    mode?: string;
  } = {};
  assignIfDefined(options, "cwd", cwdValue);
  assignIfDefined(options, "config", configValue);
  assignIfDefined(options, "mode", modeValue);
  return options;
};

const toStartOptions = (
  cwd: Option.Option<string>,
  config: Option.Option<string>,
  host: Option.Option<string>,
  port: Option.Option<number>,
): StartCommandOptions => {
  const cwdValue = toOptionalString(cwd);
  const configValue = toOptionalString(config);
  const hostValue = toOptionalString(host);
  const portValue = toOptionalNumber(port);

  const options: {
    cwd?: string;
    config?: string;
    host?: string;
    port?: number;
  } = {};
  assignIfDefined(options, "cwd", cwdValue);
  assignIfDefined(options, "config", configValue);
  assignIfDefined(options, "host", hostValue);
  assignIfDefined(options, "port", portValue);
  return options;
};

const toNewOptions = (
  name: string,
  cwd: Option.Option<string>,
  template: "bun",
): NewCommandOptions => {
  const cwdValue = toOptionalString(cwd);
  const options: {
    name: string;
    cwd?: string;
    template: "bun";
  } = {
    name,
    template,
  };
  assignIfDefined(options, "cwd", cwdValue);
  return options;
};

const devCommand = Command.make(
  "dev",
  { cwd: cwdOption, config: configOption, host: hostOption, port: portOption },
  ({
    cwd,
    config,
    host,
    port,
  }: {
    readonly cwd: Option.Option<string>;
    readonly config: Option.Option<string>;
    readonly host: Option.Option<string>;
    readonly port: Option.Option<number>;
  }) => runDevCommand(toDevOptions(cwd, config, host, port)),
);

const buildCommand = Command.make(
  "build",
  { cwd: cwdOption, config: configOption, mode: modeOption },
  ({
    cwd,
    config,
    mode,
  }: {
    readonly cwd: Option.Option<string>;
    readonly config: Option.Option<string>;
    readonly mode: Option.Option<string>;
  }) => runBuildCommand(toBuildOptions(cwd, config, mode)),
);

const startCommand = Command.make(
  "start",
  { cwd: cwdOption, config: configOption, host: hostOption, port: portOption },
  ({
    cwd,
    config,
    host,
    port,
  }: {
    readonly cwd: Option.Option<string>;
    readonly config: Option.Option<string>;
    readonly host: Option.Option<string>;
    readonly port: Option.Option<number>;
  }) => runStartCommand(toStartOptions(cwd, config, host, port)),
);

const newCommand = Command.make(
  "new",
  { name: projectNameArg, cwd: cwdOption, template: templateOption },
  ({
    name,
    cwd,
    template,
  }: {
    readonly name: string;
    readonly cwd: Option.Option<string>;
    readonly template: "bun";
  }) => runNewCommand(toNewOptions(name, cwd, template)),
);

const program = Command.make("effect-react", {}, () => Effect.void).pipe(
  Command.withSubcommands([devCommand, buildCommand, startCommand, newCommand]),
);

const cli = Command.run(program, {
  name: "Effect React CLI",
  version: "v0.1.0",
});

export type CliError = ProcessError | NewCommandError;

export const runCli = (argv: readonly string[] = process.argv) => cli(argv);

const isEntrypoint = (): boolean => {
  const current = process.argv[1];
  if (current === undefined) {
    return false;
  }
  return (
    /(?:^|\/)effect-react(?:\.cmd)?$/.test(current) ||
    /\/cli\/index\.(?:js|cjs|mjs|ts)$/.test(current)
  );
};

if (isEntrypoint()) {
  runCli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
