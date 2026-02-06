import { describe, expect, it } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { defineServerAction } from "../server";
import {
  ServerActionExportNotFoundError,
  ServerActionModuleLoadError,
  loadServerActionByName,
  loadServerActionsFromManifest,
} from "../framework";

describe("framework action registry", () => {
  it("loads server actions from manifest and deduplicates names", async () => {
    const createUser = defineServerAction({
      name: "users.create",
      run: (input: { readonly name: string }) => Effect.succeed({ id: input.name }),
    });
    const deleteUser = defineServerAction({
      name: "users.delete",
      run: (input: { readonly id: string }) => Effect.succeed({ ok: input.id.length > 0 }),
    });

    const manifest = {
      actionManifest: [
        { name: "users.create", sourcePath: "src/routes/users.ts" },
        { name: "users.create", sourcePath: "src/routes/users.ts" },
        { name: "users.delete", sourcePath: "src/routes/users.ts" },
      ] as const,
      loadActionByName: async (name: string) => {
        if (name === "users.create") {
          return { createUser };
        }
        return { deleteUser };
      },
    };

    const actions = await Effect.runPromise(loadServerActionsFromManifest(manifest));
    expect(actions.map((action) => action.name)).toEqual(["users.create", "users.delete"]);
  });

  it("fails when module load rejects", async () => {
    const manifest = {
      actionManifest: [{ name: "users.create", sourcePath: "src/routes/users.ts" }] as const,
      loadActionByName: async () => {
        throw new Error("network");
      },
    };

    const exit = await Effect.runPromiseExit(loadServerActionByName(manifest, "users.create"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ServerActionModuleLoadError);
    }
  });

  it("fails when export does not include matching action", async () => {
    const other = defineServerAction({
      name: "users.other",
      run: () => Effect.succeed("ok"),
    });

    const manifest = {
      actionManifest: [{ name: "users.create", sourcePath: "src/routes/users.ts" }] as const,
      loadActionByName: async () => ({ other }),
    };

    const exit = await Effect.runPromiseExit(loadServerActionByName(manifest, "users.create"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ServerActionExportNotFoundError);
    }
  });

  it("supports modules that directly export the action object", async () => {
    const action = defineServerAction({
      name: "users.create",
      run: () => Effect.succeed({ ok: true as const }),
    });

    const manifest = {
      actionManifest: [{ name: "users.create", sourcePath: "src/routes/users.ts" }] as const,
      loadActionByName: async () => action,
    };

    const loaded = await Effect.runPromise(loadServerActionByName(manifest, "users.create"));
    expect(loaded.name).toBe("users.create");
  });

  it("fails when loaded module is not an object", async () => {
    const manifest = {
      actionManifest: [{ name: "users.create", sourcePath: "src/routes/users.ts" }] as const,
      loadActionByName: async () => 42,
    };

    const exit = await Effect.runPromiseExit(loadServerActionByName(manifest, "users.create"));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(ServerActionExportNotFoundError);
    }
  });
});
