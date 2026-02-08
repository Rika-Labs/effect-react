import { Cause, Deferred, Effect, Fiber, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { defineForm, FormValidationError, makeForm } from "../../form";

describe("form module", () => {
  it("handles validation and submit transitions", async () => {
    const profileForm = defineForm({
      schema: Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(2)),
        age: Schema.Number.pipe(Schema.greaterThanOrEqualTo(18)),
      }),
      defaults: {
        name: "",
        age: 0,
      },
    });

    const form = await Effect.runPromise(makeForm(profileForm));

    const initial = await Effect.runPromise(form.getSnapshot);
    expect(initial.values).toEqual({ name: "", age: 0 });
    expect(initial.dirty).toBe(false);
    expect(initial.submitting).toBe(false);
    expect(initial.submitted).toBe(false);

    await Effect.runPromise(form.setField("name", "A"));
    const invalid = await Effect.runPromise(form.validate);

    expect(invalid._tag).toBe("invalid");

    const afterInvalidValidate = await Effect.runPromise(form.getSnapshot);
    expect(afterInvalidValidate.touched.name).toBe(true);
    expect(afterInvalidValidate.errors.name).toBeDefined();
    expect(afterInvalidValidate.errors.age).toBeDefined();
    expect(afterInvalidValidate.dirty).toBe(true);

    const invalidSubmit = await Effect.runPromise(
      Effect.exit(form.submit(() => Effect.succeed("ignored"))),
    );

    expect(invalidSubmit._tag).toBe("Failure");
    if (invalidSubmit._tag === "Failure") {
      const failure = Cause.failureOption(invalidSubmit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(FormValidationError);
      }
    }

    await Effect.runPromise(form.setField("name", "Ada"));
    await Effect.runPromise(form.setField("age", 32));

    const transition = await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();

        const fiber = yield* form
          .submit(() => Deferred.await(gate).pipe(Effect.as("accepted")))
          .pipe(Effect.fork);

        yield* Effect.yieldNow();
        const during = yield* form.getSnapshot;
        yield* Deferred.succeed(gate, undefined);
        const result = yield* Fiber.join(fiber);
        const after = yield* form.getSnapshot;

        return {
          during,
          result,
          after,
        };
      }),
    );

    expect(transition.during.submitting).toBe(true);
    expect(transition.during.submitted).toBe(false);
    expect(transition.result).toBe("accepted");
    expect(transition.after.submitting).toBe(false);
    expect(transition.after.submitted).toBe(true);
    expect(transition.after.errors).toEqual({});
    expect(transition.after.dirty).toBe(true);
  });

  it("handles nested defaults, valid revalidation, and failed submit cleanup", async () => {
    const nestedForm = defineForm({
      schema: Schema.Struct({
        profile: Schema.Struct({
          name: Schema.String.pipe(Schema.minLength(2)),
        }),
        tags: Schema.Array(Schema.String),
      }),
      defaults: {
        profile: {
          name: "Ada",
        },
        tags: ["effect", "react"],
      },
    });

    const form = await Effect.runPromise(makeForm(nestedForm));

    await Effect.runPromise(form.setField("tags", ["effect", "react"]));
    await Effect.runPromise(form.setField("profile", { name: "Ada" }));

    const afterEquivalentNestedUpdate = await Effect.runPromise(form.getSnapshot);
    expect(afterEquivalentNestedUpdate.dirty).toBe(false);

    await Effect.runPromise(form.setField("profile", { name: "A" }));
    const invalid = await Effect.runPromise(form.validate);

    expect(invalid._tag).toBe("invalid");
    const afterInvalid = await Effect.runPromise(form.getSnapshot);
    expect(afterInvalid.errors.profile).toBeDefined();
    expect(afterInvalid.dirty).toBe(true);

    await Effect.runPromise(form.setField("profile", { name: "Grace" }));
    const valid = await Effect.runPromise(form.validate);
    expect(valid._tag).toBe("valid");
    if (valid._tag === "valid") {
      expect(valid.values.profile.name).toBe("Grace");
      expect(valid.values.tags).toEqual(["effect", "react"]);
    }

    const failedSubmit = await Effect.runPromise(
      Effect.exit(
        form.submit(() => Effect.fail("submit-failed" as const)),
      ),
    );

    expect(failedSubmit._tag).toBe("Failure");
    if (failedSubmit._tag === "Failure") {
      const failure = Cause.failureOption(failedSubmit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value).toBe("submit-failed");
      }
    }

    const afterFailedSubmit = await Effect.runPromise(form.getSnapshot);
    expect(afterFailedSubmit.submitting).toBe(false);
    expect(afterFailedSubmit.submitted).toBe(false);
    expect(afterFailedSubmit.errors).toEqual({});
  });
});
