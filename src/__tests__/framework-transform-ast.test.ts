import { describe, expect, it } from "vitest";
import { transformServerActionCallsAst } from "../framework/vite";

describe("framework ast transform fixtures", () => {
  it("rewrites multiline call expressions and preserves comments/strings", () => {
    const input = `
      import { callServerAction, defineServerAction } from "../server"
      const label = "callServerAction(transport, no, no)"
      const saveUser = defineServerAction({
        name: "users.save",
        run: () => Effect.succeed(null)
      })

      // callServerAction should only be rewritten below
      const result = callServerAction(
        transport,
        saveUser,
        { id: "u1" },
        { signal: options.signal }
      )
    `;

    const output = transformServerActionCallsAst(input);
    expect(output).toContain('callServerActionByName(transport, "users.save", { id: "u1" }');
    expect(output).toContain('label = "callServerAction(transport, no, no)"');
    expect(output).toContain("// callServerAction should only be rewritten below");
  });

  it("does not rewrite calls that do not use an identifier action reference", () => {
    const input = `
      import { callServerAction, defineServerAction } from "../server"
      const saveUser = defineServerAction({
        name: "users.save",
        run: () => Effect.succeed(null)
      })
      const result = callServerAction(transport, actions.saveUser, { id: "u1" })
    `;

    const output = transformServerActionCallsAst(input);
    expect(output).toContain('callServerAction(transport, actions.saveUser, { id: "u1" })');
    expect(output).not.toContain("callServerActionByName(");
  });

  it("avoids duplicating import specifiers when callServerActionByName is already imported", () => {
    const input = `
      import {
        callServerAction,
        callServerActionByName,
        defineServerAction
      } from "../server"
      const saveUser = defineServerAction({
        name: "users.save",
        run: () => Effect.succeed(null)
      })
      const result = callServerAction(transport, saveUser, { id: "u1" })
    `;

    const output = transformServerActionCallsAst(input);
    expect(output.match(/callServerActionByName/g)?.length).toBe(2);
  });
});
