import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import { useForm, type UseFormResult } from "../forms";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("form primitives", () => {
  it("handles change, blur, submit, and reset lifecycle", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const submitted: string[] = [];
    let form: UseFormResult<{ readonly name: string }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "" },
        validate: (values) =>
          values.name.length === 0
            ? {
                name: "required",
              }
            : {},
        onSubmit: async (values) => {
          submitted.push(values.name);
        },
      });

      return (
        <div>
          <div data-testid="dirty">{String(form.dirty)}</div>
          <div data-testid="error">{form.errors["name"] ?? "-"}</div>
          <div data-testid="touched">{String(form.touched["name"] === true)}</div>
          <div data-testid="value">{form.values.name}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("dirty").textContent).toBe("false");

    form!.blurField("name");
    await waitFor(() => {
      expect(screen.getByTestId("touched").textContent).toBe("true");
    });

    await expect(form!.validateForm()).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("required");
    });

    form!.setFieldValue("name", "rika");
    await waitFor(() => {
      expect(screen.getByTestId("dirty").textContent).toBe("true");
      expect(screen.getByTestId("value").textContent).toBe("rika");
    });

    await expect(form!.submit()).resolves.toBe(true);
    expect(submitted).toEqual(["rika"]);

    form!.reset();
    await waitFor(() => {
      expect(screen.getByTestId("dirty").textContent).toBe("false");
      expect(screen.getByTestId("value").textContent).toBe("");
      expect(screen.getByTestId("error").textContent).toBe("-");
    });

    await runtime.dispose();
  });

  it("cancels stale async field validation results", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string }> | undefined;
    const resolvers: ((value: string | undefined) => void)[] = [];

    const Probe = () => {
      form = useForm({
        initialValues: { name: "" },
        validateField: async () =>
          await new Promise<string | undefined>((resolve) => {
            resolvers.push(resolve);
          }),
      });

      return <div data-testid="error">{form.errors["name"] ?? "-"}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    form!.setFieldValue("name", "first");
    const firstValidation = form!.validateField("name");
    form!.setFieldValue("name", "second");
    const secondValidation = form!.validateField("name");

    resolvers[1]!(undefined);
    await expect(secondValidation).resolves.toBe(true);

    resolvers[0]!("invalid");
    await expect(firstValidation).resolves.toBe(false);

    expect(screen.getByTestId("error").textContent).toBe("-");
    await runtime.dispose();
  });

  it("supports submit cancellation", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly value: number }> | undefined;
    let interrupted = 0;

    const Probe = () => {
      form = useForm({
        initialValues: { value: 1 },
        onSubmit: () =>
          Effect.succeed(undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted += 1;
              }),
            ),
          ),
      });

      return <div data-testid="submitting">{String(form.isSubmitting)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const submitPromise = form!.submit();

    await waitFor(() => {
      expect(screen.getByTestId("submitting").textContent).toBe("true");
    });

    form!.cancelSubmit();

    await expect(submitPromise).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("submitting").textContent).toBe("false");
    });
    expect(interrupted).toBe(1);

    await runtime.dispose();
  });

  it("supports register handlers and validateField fallback to validate", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "" },
        validate: (values) => (values.name.length === 0 ? { name: "required" } : {}),
      });

      const field = form.register("name");
      return (
        <div>
          <div data-testid="value">{String(field.value)}</div>
          <div data-testid="error">{field.error ?? "-"}</div>
          <div data-testid="touched">{String(field.touched)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const field = form!.register("name");
    field.onBlur();
    field.onChange("");
    await waitFor(() => {
      expect(screen.getByTestId("touched").textContent).toBe("true");
      expect(screen.getByTestId("value").textContent).toBe("");
    });

    await expect(form!.validateField("name")).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("required");
    });

    form!.setFieldValue("name", "ok");
    await expect(form!.validateField("name")).resolves.toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("-");
    });

    await runtime.dispose();
  });

  it("returns true when submitting without onSubmit", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly value: number }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { value: 1 },
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await expect(form!.submit()).resolves.toBe(true);
    await runtime.dispose();
  });

  it("returns false for rejected promise and failed effect submissions", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let promiseForm: UseFormResult<{ readonly value: number }> | undefined;
    let effectForm: UseFormResult<{ readonly value: number }> | undefined;

    const PromiseProbe = () => {
      promiseForm = useForm({
        initialValues: { value: 1 },
        onSubmit: async () => {
          throw new Error("promise-submit-failed");
        },
      });
      return null;
    };

    const EffectProbe = () => {
      effectForm = useForm({
        initialValues: { value: 1 },
        onSubmit: () => Effect.fail("effect-submit-failed"),
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <PromiseProbe />
      </EffectProvider>,
    );
    render(
      <EffectProvider runtime={runtime}>
        <EffectProbe />
      </EffectProvider>,
    );

    await expect(promiseForm!.submit()).resolves.toBe(false);
    await expect(effectForm!.submit()).resolves.toBe(false);
    await runtime.dispose();
  });

  it("marks dirty when initial value shape changes", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string; readonly extra?: string }> | undefined;

    const Probe = ({
      initialValues,
    }: {
      readonly initialValues: { readonly name: string; readonly extra?: string };
    }) => {
      form = useForm({
        initialValues,
      });
      return <div data-testid="dirty">{String(form.dirty)}</div>;
    };

    const view = render(
      <EffectProvider runtime={runtime}>
        <Probe initialValues={{ name: "" }} />
      </EffectProvider>,
    );

    expect(screen.getByTestId("dirty").textContent).toBe("false");

    view.rerender(
      <EffectProvider runtime={runtime}>
        <Probe initialValues={{ name: "", extra: "x" }} />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dirty").textContent).toBe("true");
    });

    await runtime.dispose();
  });
});
