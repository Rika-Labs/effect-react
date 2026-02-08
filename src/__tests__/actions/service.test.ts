import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { AnyActionDefinition } from "../../actions";
import { defineAction, dispatchAction, runAction } from "../../actions";
import { BoundaryDecodeError } from "../../boundary";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";

const homeRoute = defineRoute({
  id: "home",
  path: "/",
});

const createRuntime = (actions: readonly AnyActionDefinition[] = []) =>
  createAppRuntime({
    routes: [homeRoute] as const,
    actions,
  });

const withRuntime = async <A>(
  actions: readonly AnyActionDefinition[],
  run: (runtime: ReturnType<typeof createAppRuntime>) => Promise<A>,
): Promise<A> => {
  const runtime = createRuntime(actions);
  try {
    return await run(runtime);
  } finally {
    await runtime.dispose();
  }
};

describe("action service dispatch and run", () => {
  it("runs and dispatches successful actions", async () => {
    const incrementAction = defineAction({
      name: "action.success",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ value }) => Effect.succeed({ value: value + 1 }),
    });

    const result = await withRuntime([incrementAction] as const, async (runtime) => {
      const runValue = await runtime.runPromise(
        runAction(incrementAction, { value: 4 }),
      );
      const wire = await runtime.runPromise(
        dispatchAction(incrementAction.name, { value: 4 }),
      );
      return { runValue, wire };
    });

    expect(result.runValue).toEqual({ value: 5 });
    expect(result.wire).toEqual({
      _tag: "success",
      value: { value: 5 },
    });
  });

  it("returns defect for unknown dispatched action names", async () => {
    const wire = await withRuntime([], (runtime) =>
      runtime.runPromise(dispatchAction("missing.action", { value: 1 })),
    );

    expect(wire).toEqual({
      _tag: "defect",
      message: "Unknown action: missing.action",
    });
  });

  it("propagates typed handler failures from run and dispatch", async () => {
    const failAction = defineAction({
      name: "action.fail.typed",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.Struct({ reason: Schema.String }),
      handler: () => Effect.fail({ reason: "blocked" }),
    });

    const result = await withRuntime([failAction] as const, async (runtime) => {
      const runError = await runtime.runPromise(
        Effect.flip(runAction(failAction, { value: 1 })),
      );
      const wire = await runtime.runPromise(
        dispatchAction(failAction.name, { value: 1 }),
      );
      return { runError, wire };
    });

    expect(result.runError).toEqual({ reason: "blocked" });
    expect(result.wire).toEqual({
      _tag: "failure",
      error: { reason: "blocked" },
    });
  });

  it("fails run with BoundaryDecodeError when input decoding fails", async () => {
    const parseAction = defineAction({
      name: "action.decode.input",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.String,
      handler: ({ value }) => Effect.succeed(value + 1),
    });

    const runError = await withRuntime([parseAction] as const, (runtime) =>
      runtime.runPromise(
        Effect.flip(runAction(parseAction, { value: "not-a-number" })),
      ),
    );

    expect(runError).toBeInstanceOf(BoundaryDecodeError);
    if (runError instanceof BoundaryDecodeError) {
      expect(runError.source).toBe(`action:${parseAction.name}:input`);
    }
  });

  it("returns defect from dispatch when dispatch input decoding fails", async () => {
    const parseAction = defineAction({
      name: "action.decode.dispatch",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.String,
      handler: ({ value }) => Effect.succeed(value + 1),
    });

    const wire = await withRuntime([parseAction] as const, (runtime) =>
      runtime.runPromise(
        dispatchAction(parseAction.name, { value: "not-a-number" }),
      ),
    );

    expect(wire._tag).toBe("defect");
    if (wire._tag === "defect") {
      expect(wire.message).toContain("BoundaryDecodeError");
    }
  });

  it("fails run when action output decoding fails", async () => {
    const invalidOutputAction = defineAction({
      name: "action.decode.output",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.String,
      handler: ({ value }) =>
        Effect.succeed({ value: String(value) } as unknown as { value: number }),
    });

    const runError = await withRuntime([invalidOutputAction] as const, (runtime) =>
      runtime.runPromise(
        Effect.flip(runAction(invalidOutputAction, { value: 7 })),
      ),
    );

    expect(runError).toBeInstanceOf(BoundaryDecodeError);
    if (runError instanceof BoundaryDecodeError) {
      expect(runError.source).toBe(`action:${invalidOutputAction.name}:output`);
    }
  });

  it("returns defect when handler fails with boundary errors", async () => {
    const boundaryFailureAction = defineAction({
      name: "action.boundary.failure",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.Unknown,
      handler: () =>
        Effect.fail(
          new BoundaryDecodeError("handler:decode", "handler payload was invalid"),
        ),
    });

    const wire = await withRuntime([boundaryFailureAction] as const, (runtime) =>
      runtime.runPromise(
        dispatchAction(boundaryFailureAction.name, { value: 1 }),
      ),
    );

    expect(wire._tag).toBe("defect");
    if (wire._tag === "defect") {
      expect(wire.message).toContain("BoundaryDecodeError");
      expect(wire.message).toContain("handler payload was invalid");
    }
  });

  it("returns failure with original value when encoding failure payload fails", async () => {
    const failureEncodingAction = defineAction({
      name: "action.failure.encoding",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.Struct({ reason: Schema.String }),
      handler: () =>
        Effect.fail({ reason: 123 } as unknown as { reason: string }),
    });

    const wire = await withRuntime([failureEncodingAction] as const, (runtime) =>
      runtime.runPromise(
        dispatchAction(failureEncodingAction.name, { value: 1 }),
      ),
    );

    expect(wire).toEqual({
      _tag: "failure",
      error: { reason: 123 },
    });
  });

  it("returns defect when handler dies with a non-failure cause", async () => {
    const defectAction = defineAction({
      name: "action.die",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      error: Schema.Unknown,
      handler: () => Effect.die("fatal-defect"),
    });

    const wire = await withRuntime([defectAction] as const, (runtime) =>
      runtime.runPromise(dispatchAction(defectAction.name, { value: 1 })),
    );

    expect(wire._tag).toBe("defect");
    if (wire._tag === "defect") {
      expect(wire.message).toContain("fatal-defect");
    }
  });

  it("returns defect when successful output cannot be encoded for wire transport", async () => {
    const invalidWireOutputAction = defineAction({
      name: "action.encode.output",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Struct({ value: Schema.Number }),
      error: Schema.String,
      handler: ({ value }) =>
        Effect.succeed({ value: String(value) } as unknown as { value: number }),
    });

    const wire = await withRuntime([invalidWireOutputAction] as const, (runtime) =>
      runtime.runPromise(
        dispatchAction(invalidWireOutputAction.name, { value: 2 }),
      ),
    );

    expect(wire._tag).toBe("defect");
    if (wire._tag === "defect") {
      expect(wire.message).toContain("BoundaryProtocolError");
    }
  });
});
