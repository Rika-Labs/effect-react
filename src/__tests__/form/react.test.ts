import { act, renderHook, waitFor } from "@testing-library/react";
import { Effect, Schema } from "effect";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { defineForm, useForm } from "../../form";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";
import { EffectProvider } from "../../react";

const createRuntimeWrapper = (runtime: ReturnType<typeof createAppRuntime>) => {
  const Wrapper = ({ children }: { readonly children?: ReactNode }) =>
    createElement(EffectProvider, { runtime }, children);
  return Wrapper;
};

describe("form react module", () => {
  it("exposes hook state plus promise/effect command APIs", async () => {
    const home = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [home] as const,
    });

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

    const { result, unmount } = renderHook(() => useForm(profileForm), {
      wrapper: createRuntimeWrapper(runtime),
    });

    try {
      expect(result.current.values).toEqual({
        name: "",
        age: 0,
      });
      expect(result.current.dirty).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.submitted).toBe(false);

      await act(async () => {
        await result.current.setField("name", "A");
      });

      await waitFor(() => {
        expect(result.current.values.name).toBe("A");
        expect(result.current.touched.name).toBe(true);
        expect(result.current.dirty).toBe(true);
      });

      await act(async () => {
        const validation = await result.current.validate();
        expect(validation._tag).toBe("invalid");
      });

      expect(result.current.errors.name).toBeDefined();
      expect(result.current.errors.age).toBeDefined();

      await act(async () => {
        await expect(result.current.submit(() => Effect.succeed("ignored"))).rejects.toThrow(
          "Form validation failed",
        );
      });

      expect(result.current.submitting).toBe(false);
      expect(result.current.submitted).toBe(false);

      await act(async () => {
        await result.current.setField("name", "Ada");
        await result.current.setField("age", 32);
      });

      await act(async () => {
        const accepted = await result.current.submit((values) =>
          Effect.succeed(`${values.name}:${String(values.age)}`),
        );
        expect(accepted).toBe("Ada:32");
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
        expect(result.current.submitted).toBe(true);
        expect(result.current.errors).toEqual({});
      });

      await act(async () => {
        await result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.values).toEqual({
          name: "",
          age: 0,
        });
        expect(result.current.dirty).toBe(false);
        expect(result.current.submitted).toBe(false);
      });

      await act(async () => {
        await runtime.runPromise(result.current.commands.setField("age", 40));
      });

      await waitFor(() => {
        expect(result.current.values.age).toBe(40);
      });
    } finally {
      unmount();
    }
  });
});
