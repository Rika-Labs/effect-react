# Forms

## Purpose

Manage form state, validation, and submission with Effect-aware handlers.

## Imports

```ts
import { useForm, useFieldArray, Controller } from "@effect-react/react/forms";
```

## Key APIs

- `useForm`
- `useFieldArray`
- `Controller`
- types: `UseFormOptions`, `UseFormResult`, `RegisteredField`

## Behavior Guarantees

- field registration and dirty/touched tracking are deterministic.
- submit handlers can remain fully typed and Effect-native.

## Failure Model

- validation failures can be surfaced as structured field/form errors.

## Minimal Example

```tsx
import { useForm } from "@effect-react/react/forms";

export function ProfileForm() {
  const form = useForm({
    initialValues: { name: "" },
    onSubmit: async (values) => {
      console.log(values);
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <input {...form.register("name")} />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Related

- [`server.md`](server.md)
- [`state.md`](state.md)
