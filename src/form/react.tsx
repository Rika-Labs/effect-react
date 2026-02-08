import { Effect, Fiber, Stream } from "effect";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEffectRuntime } from "../react/provider";
import { makeForm } from "./service";
import type {
  FormContract,
  FormFieldName,
  FormState,
  FormStore,
  FormSubmitHandler,
  FormValidationResult,
  FormValues,
} from "./types";

const useFormStore = <Values extends FormValues, Encoded = Values>(
  contract: FormContract<Values, Encoded>,
): FormStore<Values> => {
  const runtime = useEffectRuntime();
  return useMemo(() => runtime.runSync(makeForm(contract)), [contract, runtime]);
};

export interface UseFormResult<Values extends FormValues> extends FormState<Values> {
  readonly commands: Pick<FormStore<Values>, "setField" | "reset" | "validate" | "submit">;
  readonly setField: <Field extends FormFieldName<Values>>(
    field: Field,
    value: Values[Field],
  ) => Promise<void>;
  readonly reset: () => Promise<void>;
  readonly validate: () => Promise<FormValidationResult<Values>>;
  readonly submit: <A, E>(handler: FormSubmitHandler<Values, A, E, never>) => Promise<A>;
}

export const useForm = <Values extends FormValues, Encoded = Values>(
  contract: FormContract<Values, Encoded>,
): UseFormResult<Values> => {
  const runtime = useEffectRuntime();
  const form = useFormStore(contract);

  const subscribe = useCallback(
    (listener: () => void) => {
      const fiber = runtime.runFork(Stream.runForEach(form.snapshots, () => Effect.sync(listener)));

      return () => {
        runtime.runFork(Fiber.interrupt(fiber));
      };
    },
    [form, runtime],
  );

  const getSnapshot = useCallback(() => runtime.runSync(form.getSnapshot), [form, runtime]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setField = useCallback<UseFormResult<Values>["setField"]>(
    (field, value) => runtime.runPromise(form.setField(field, value)),
    [form, runtime],
  );

  const reset = useCallback<UseFormResult<Values>["reset"]>(
    () => runtime.runPromise(form.reset),
    [form, runtime],
  );

  const validate = useCallback<UseFormResult<Values>["validate"]>(
    () => runtime.runPromise(form.validate),
    [form, runtime],
  );

  const submit = useCallback<UseFormResult<Values>["submit"]>(
    (handler) => runtime.runPromise(form.submit(handler)),
    [form, runtime],
  );

  return {
    ...snapshot,
    commands: {
      setField: form.setField,
      reset: form.reset,
      validate: form.validate,
      submit: form.submit,
    },
    setField,
    reset,
    validate,
    submit,
  };
};
