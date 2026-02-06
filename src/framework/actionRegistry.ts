import { Effect } from "effect";
import type { AnyServerAction } from "../server";

export interface ServerActionManifestEntry {
  readonly name: string;
  readonly sourcePath: string;
}

export interface ServerActionManifestModule {
  readonly actionManifest: readonly ServerActionManifestEntry[];
  readonly loadActionByName: (name: string) => Promise<unknown>;
}

export class ServerActionModuleLoadError extends Error {
  constructor(
    readonly actionName: string,
    readonly causeValue: unknown,
  ) {
    super(`Failed to load server action module for "${actionName}"`);
    this.name = "ServerActionModuleLoadError";
  }
}

export class ServerActionExportNotFoundError extends Error {
  constructor(readonly actionName: string) {
    super(`Server action export not found for "${actionName}"`);
    this.name = "ServerActionExportNotFoundError";
  }
}

export type ServerActionRegistryError =
  | ServerActionModuleLoadError
  | ServerActionExportNotFoundError;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
};

const isServerActionLike = (value: unknown): value is AnyServerAction => {
  const record = asRecord(value);
  if (record === undefined) {
    return false;
  }
  return typeof record["name"] === "string" && typeof record["run"] === "function";
};

const findNamedServerAction = (moduleValue: unknown, name: string): AnyServerAction | undefined => {
  if (isServerActionLike(moduleValue) && moduleValue.name === name) {
    return moduleValue;
  }

  const record = asRecord(moduleValue);
  if (record === undefined) {
    return undefined;
  }

  for (const value of Object.values(record)) {
    if (isServerActionLike(value) && value.name === name) {
      return value;
    }
  }

  return undefined;
};

export const loadServerActionByName = (
  manifestModule: ServerActionManifestModule,
  name: string,
): Effect.Effect<AnyServerAction, ServerActionRegistryError, never> =>
  Effect.tryPromise({
    try: () => manifestModule.loadActionByName(name),
    catch: (cause) => new ServerActionModuleLoadError(name, cause),
  }).pipe(
    Effect.flatMap((moduleValue) => {
      const action = findNamedServerAction(moduleValue, name);
      if (action === undefined) {
        return Effect.fail(new ServerActionExportNotFoundError(name));
      }
      return Effect.succeed(action);
    }),
  );

export const loadServerActionsFromManifest = (
  manifestModule: ServerActionManifestModule,
): Effect.Effect<readonly AnyServerAction[], ServerActionRegistryError, never> =>
  Effect.gen(function* () {
    const dedupedNames = Array.from(
      new Set(manifestModule.actionManifest.map((entry) => entry.name)),
    );
    const actions = yield* Effect.forEach(dedupedNames, (name) =>
      loadServerActionByName(manifestModule, name),
    );
    return actions;
  });
