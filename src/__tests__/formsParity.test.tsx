import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Layer, ManagedRuntime, Schema } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import { useForm, type UseFormResult } from "../forms/useForm";
import { useFieldArray, type UseFieldArrayResult } from "../forms/useFieldArray";
import { Controller } from "../forms/Controller";
import { getNestedValue, setNestedValue } from "../internal/pathUtils";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("pathUtils", () => {
  it("gets nested values at dot paths", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, "a")).toEqual({ b: { c: 42 } });
    expect(getNestedValue(obj, "a.b")).toEqual({ c: 42 });
    expect(getNestedValue(obj, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing paths", () => {
    const obj = { a: { b: 1 } };
    expect(getNestedValue(obj, "a.x")).toBeUndefined();
    expect(getNestedValue(obj, "z.y.x")).toBeUndefined();
    expect(getNestedValue(null, "a")).toBeUndefined();
  });

  it("gets values from arrays by index", () => {
    const obj = { items: [{ name: "first" }, { name: "second" }] };
    expect(getNestedValue(obj, "items.0.name")).toBe("first");
    expect(getNestedValue(obj, "items.1.name")).toBe("second");
  });

  it("sets nested values immutably", () => {
    const obj = { a: { b: { c: 1 } } };
    const result = setNestedValue(obj, "a.b.c", 99);
    expect(result).toEqual({ a: { b: { c: 99 } } });
    expect(obj.a.b.c).toBe(1);
  });

  it("sets top-level values", () => {
    const obj = { x: 1 };
    const result = setNestedValue(obj, "x", 2);
    expect(result).toEqual({ x: 2 });
  });

  it("creates intermediate objects when missing", () => {
    const obj = {} as Record<string, unknown>;
    const result = setNestedValue(obj, "a.b.c", "hello");
    expect(result).toEqual({ a: { b: { c: "hello" } } });
  });
});

describe("useFieldArray", () => {
  type TodoItem = {
    readonly text: string;
    readonly [key: string]: unknown;
  };

  it("appends and removes items", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly todos: readonly TodoItem[] }> | undefined;
    let fieldArray: UseFieldArrayResult<TodoItem> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { todos: [] as readonly TodoItem[] },
      });
      fieldArray = useFieldArray<{ readonly todos: readonly TodoItem[] }, TodoItem>({
        name: "todos",
        values: form.values,
        setFieldValue: form.setFieldValue as (field: string, value: unknown) => void,
      });
      return <div data-testid="count">{fieldArray.fields.length}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");

    fieldArray!.append({ text: "first" });
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    fieldArray!.append({ text: "second" });
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("2");
    });

    fieldArray!.remove(0);
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    expect(fieldArray!.fields[0]!.text).toBe("second");
    await runtime.dispose();
  });

  it("assigns stable _id to each field item", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly items: readonly TodoItem[] }> | undefined;
    let fieldArray: UseFieldArrayResult<TodoItem> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { items: [{ text: "a" }, { text: "b" }] as readonly TodoItem[] },
      });
      fieldArray = useFieldArray<{ readonly items: readonly TodoItem[] }, TodoItem>({
        name: "items",
        values: form.values,
        setFieldValue: form.setFieldValue as (field: string, value: unknown) => void,
      });
      return <div data-testid="ids">{fieldArray.fields.map((f) => f._id).join(",")}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const ids = screen.getByTestId("ids").textContent;
    expect(ids).toContain("field_");
    expect(ids!.split(",")).toHaveLength(2);
    await runtime.dispose();
  });

  it("moves items between positions", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let fieldArray: UseFieldArrayResult<TodoItem> | undefined;

    const Probe = () => {
      const form = useForm({
        initialValues: {
          items: [{ text: "a" }, { text: "b" }, { text: "c" }] as readonly TodoItem[],
        },
      });
      fieldArray = useFieldArray<{ readonly items: readonly TodoItem[] }, TodoItem>({
        name: "items",
        values: form.values,
        setFieldValue: form.setFieldValue as (field: string, value: unknown) => void,
      });
      return <div data-testid="texts">{fieldArray.fields.map((f) => f.text).join(",")}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    fieldArray!.move(0, 2);
    await waitFor(() => {
      expect(screen.getByTestId("texts").textContent).toBe("b,c,a");
    });
    await runtime.dispose();
  });

  it("swaps items at two positions", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let fieldArray: UseFieldArrayResult<TodoItem> | undefined;

    const Probe = () => {
      const form = useForm({
        initialValues: {
          items: [{ text: "a" }, { text: "b" }, { text: "c" }] as readonly TodoItem[],
        },
      });
      fieldArray = useFieldArray<{ readonly items: readonly TodoItem[] }, TodoItem>({
        name: "items",
        values: form.values,
        setFieldValue: form.setFieldValue as (field: string, value: unknown) => void,
      });
      return <div data-testid="texts">{fieldArray.fields.map((f) => f.text).join(",")}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    fieldArray!.swap(0, 2);
    await waitFor(() => {
      expect(screen.getByTestId("texts").textContent).toBe("c,b,a");
    });
    await runtime.dispose();
  });
});

describe("schema validation", () => {
  it("validates form with Effect Schema", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const UserSchema = Schema.Struct({
      name: Schema.NonEmptyString,
      email: Schema.NonEmptyString,
    });
    type User = typeof UserSchema.Type;
    let form: UseFormResult<User> | undefined;

    const Probe = () => {
      form = useForm<User>({
        initialValues: { name: "", email: "" },
        schema: UserSchema,
      });
      return (
        <div>
          <div data-testid="nameError">{form.errors["name"] ?? "-"}</div>
          <div data-testid="emailError">{form.errors["email"] ?? "-"}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    await expect(form!.validateForm()).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("nameError").textContent).not.toBe("-");
      expect(screen.getByTestId("emailError").textContent).not.toBe("-");
    });

    form!.setFieldValue("name", "Rika");
    form!.setFieldValue("email", "rika@test.com");
    await expect(form!.validateForm()).resolves.toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId("nameError").textContent).toBe("-");
      expect(screen.getByTestId("emailError").textContent).toBe("-");
    });

    await runtime.dispose();
  });

  it("custom validate takes precedence over schema", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const UserSchema = Schema.Struct({
      name: Schema.NonEmptyString,
    });
    type User = typeof UserSchema.Type;
    let form: UseFormResult<User> | undefined;

    const Probe = () => {
      form = useForm<User>({
        initialValues: { name: "" },
        schema: UserSchema,
        validate: (values) => (values.name === "bad" ? { name: "custom-error" } : {}),
      });
      return <div data-testid="error">{form.errors["name"] ?? "-"}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    form!.setFieldValue("name", "bad");
    await expect(form!.validateForm()).resolves.toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe("custom-error");
    });

    await runtime.dispose();
  });
});

describe("watch", () => {
  it("returns all values when called with no args", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string; readonly age: number }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "test", age: 25 },
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const all = form!.watch();
    expect(all).toEqual({ name: "test", age: 25 });
    await runtime.dispose();
  });

  it("returns only specified fields when called with args", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string; readonly age: number }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "test", age: 25 },
      });
      return null;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    const partial = form!.watch("name");
    expect(partial).toEqual({ name: "test" });
    expect(partial).not.toHaveProperty("age");
    await runtime.dispose();
  });

  it("reflects updated values after setFieldValue", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "initial" },
      });
      return <div data-testid="watched">{form.watch("name").name}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("watched").textContent).toBe("initial");

    form!.setFieldValue("name", "updated");
    await waitFor(() => {
      expect(screen.getByTestId("watched").textContent).toBe("updated");
    });

    await runtime.dispose();
  });
});

describe("Controller", () => {
  it("renders with registered field props", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "hello" },
      });
      return (
        <Controller
          name="name"
          form={form}
          render={(field) => (
            <div>
              <div data-testid="ctrl-name">{String(field.name)}</div>
              <div data-testid="ctrl-value">{String(field.value)}</div>
              <div data-testid="ctrl-touched">{String(field.touched)}</div>
            </div>
          )}
        />
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("ctrl-name").textContent).toBe("name");
    expect(screen.getByTestId("ctrl-value").textContent).toBe("hello");
    expect(screen.getByTestId("ctrl-touched").textContent).toBe("false");

    await runtime.dispose();
  });

  it("updates when field value changes", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    let form: UseFormResult<{ readonly name: string }> | undefined;

    const Probe = () => {
      form = useForm({
        initialValues: { name: "initial" },
      });
      return (
        <Controller
          name="name"
          form={form}
          render={(field) => <div data-testid="ctrl-value">{String(field.value)}</div>}
        />
      );
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("ctrl-value").textContent).toBe("initial");

    form!.setFieldValue("name", "changed");
    await waitFor(() => {
      expect(screen.getByTestId("ctrl-value").textContent).toBe("changed");
    });

    await runtime.dispose();
  });
});

describe("nested path support in useForm", () => {
  it("sets and reads nested values via dot paths", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    type FormValues = { readonly profile: { readonly name: string; readonly age: number } };
    let form: UseFormResult<FormValues> | undefined;

    const Probe = () => {
      form = useForm<FormValues>({
        initialValues: { profile: { name: "test", age: 10 } },
      });
      const field = form.register("profile.name" as keyof FormValues);
      return <div data-testid="nested-value">{String(field.value as unknown)}</div>;
    };

    render(
      <EffectProvider runtime={runtime}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("nested-value").textContent).toBe("test");

    form!.setFieldValue("profile.name" as keyof FormValues, "updated" as never);
    await waitFor(() => {
      expect(screen.getByTestId("nested-value").textContent).toBe("updated");
    });

    expect(form!.values.profile.name).toBe("updated");
    expect(form!.values.profile.age).toBe(10);

    await runtime.dispose();
  });
});
