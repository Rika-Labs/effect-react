import { constants as FsConstants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { resolveStarterTemplate, type StarterTemplateName } from "../starter/template";

export interface NewCommandOptions {
  readonly name: string;
  readonly cwd?: string;
  readonly template?: StarterTemplateName;
}

export interface ScaffoldStarterProjectResult {
  readonly targetPath: string;
  readonly template: StarterTemplateName;
  readonly fileCount: number;
}

export type NewCommandError =
  | {
      readonly _tag: "invalid_project_name";
      readonly name: string;
      readonly message: string;
    }
  | {
      readonly _tag: "target_exists";
      readonly targetPath: string;
    }
  | {
      readonly _tag: "target_access_failed";
      readonly targetPath: string;
      readonly cause: unknown;
    }
  | {
      readonly _tag: "directory_create_failed";
      readonly directoryPath: string;
      readonly cause: unknown;
    }
  | {
      readonly _tag: "file_write_failed";
      readonly filePath: string;
      readonly cause: unknown;
    };

const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const isErrnoException = (
  value: unknown,
): value is {
  readonly code?: string;
} => typeof value === "object" && value !== null && "code" in value;

const isNotFoundError = (value: unknown): boolean =>
  isErrnoException(value) && value.code === "ENOENT";

const validateProjectName = (name: string): Effect.Effect<void, NewCommandError, never> =>
  PROJECT_NAME_PATTERN.test(name)
    ? Effect.void
    : Effect.fail({
        _tag: "invalid_project_name",
        name,
        message:
          "Project name must start with an alphanumeric character and contain only letters, numbers, '.', '-', or '_'",
      });

const ensureTargetPathMissing = (targetPath: string): Effect.Effect<void, NewCommandError, never> =>
  Effect.tryPromise({
    try: () => access(targetPath, FsConstants.F_OK),
    catch: (cause) => cause,
  }).pipe(
    Effect.matchEffect({
      onFailure: (cause) =>
        isNotFoundError(cause)
          ? Effect.void
          : Effect.fail({
              _tag: "target_access_failed",
              targetPath,
              cause,
            }),
      onSuccess: () =>
        Effect.fail({
          _tag: "target_exists",
          targetPath,
        }),
    }),
  );

const createDirectory = (directoryPath: string): Effect.Effect<void, NewCommandError, never> =>
  Effect.tryPromise({
    try: () => mkdir(directoryPath, { recursive: true }),
    catch: (cause) =>
      ({
        _tag: "directory_create_failed",
        directoryPath,
        cause,
      }) satisfies NewCommandError,
  });

const writeStarterFile = (
  targetPath: string,
  filePath: string,
  content: string,
): Effect.Effect<void, NewCommandError, never> =>
  Effect.gen(function* () {
    const absolutePath = path.join(targetPath, filePath);
    const parentDirectory = path.dirname(absolutePath);
    yield* createDirectory(parentDirectory);

    yield* Effect.tryPromise({
      try: () => writeFile(absolutePath, content, "utf8"),
      catch: (cause) =>
        ({
          _tag: "file_write_failed",
          filePath: absolutePath,
          cause,
        }) satisfies NewCommandError,
    });
  });

export const scaffoldStarterProject = (
  options: NewCommandOptions,
): Effect.Effect<ScaffoldStarterProjectResult, NewCommandError, never> =>
  Effect.gen(function* () {
    const templateName = options.template ?? "bun";
    yield* validateProjectName(options.name);

    const cwd = options.cwd ?? process.cwd();
    const targetPath = path.resolve(cwd, options.name);
    yield* ensureTargetPathMissing(targetPath);
    yield* createDirectory(targetPath);

    const template = resolveStarterTemplate(templateName, options.name);
    yield* Effect.forEach(template.files, (file) =>
      writeStarterFile(targetPath, file.path, file.content),
    );

    return {
      targetPath,
      template: templateName,
      fileCount: template.files.length,
    };
  });

const renderNextSteps = (result: ScaffoldStarterProjectResult, cwd: string): readonly string[] => {
  const relativeTarget = path.relative(cwd, result.targetPath);
  const directory = relativeTarget.length > 0 ? relativeTarget : ".";

  return [
    "",
    `Scaffolded ${result.template} starter in ${directory}`,
    "",
    "Next steps:",
    `  cd ${directory}`,
    "  bun install",
    "  bun run dev",
    "",
  ];
};

export const runNewCommand = (
  options: NewCommandOptions,
): Effect.Effect<void, NewCommandError, never> =>
  scaffoldStarterProject(options).pipe(
    Effect.flatMap((result) =>
      Effect.forEach(
        renderNextSteps(result, options.cwd ?? process.cwd()),
        (line) => Effect.log(line),
        {
          discard: true,
        },
      ),
    ),
  );
