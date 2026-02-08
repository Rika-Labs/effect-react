import { Effect, ParseResult, Schema, SubscriptionRef } from "effect";
import {
  type FormContract,
  type FormErrorKey,
  type FormErrors,
  type FormFieldName,
  type FormState,
  type FormStore,
  FormValidationError,
  type FormValidationResult,
  type FormValues,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cloneUnknown = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneUnknown(entry));
  }

  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneUnknown(entry);
    }
    return clone;
  }

  return value;
};

const cloneValue = <A>(value: A): A => {
  return cloneUnknown(value) as A;
};

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!(key in right)) {
        return false;
      }
      if (!deepEqual(left[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
};

const toFormErrors = <Values extends FormValues>(
  error: ParseResult.ParseError,
  fieldNames: ReadonlySet<string>,
): FormErrors<Values> => {
  const formatted = ParseResult.ArrayFormatter.formatErrorSync(error);
  const errors: Partial<Record<FormErrorKey<Values>, string>> = {};

  for (const entry of formatted) {
    const root = entry.path[0];
    if (typeof root === "string" && fieldNames.has(root)) {
      const key = root as FormFieldName<Values>;
      errors[key] ??= entry.message;
      continue;
    }

    errors._form ??= entry.message;
  }

  if (formatted.length === 0 && errors._form === undefined) {
    errors._form = "Invalid form values.";
  }

  return errors;
};

const createInitialState = <Values extends FormValues>(defaults: Values): FormState<Values> => ({
  values: cloneValue(defaults),
  errors: {} as FormErrors<Values>,
  touched: {} as FormState<Values>["touched"],
  dirty: false,
  submitting: false,
  submitted: false,
});

export const makeForm = <Values extends FormValues, Encoded = Values>(
  contract: FormContract<Values, Encoded>,
): Effect.Effect<FormStore<Values>, never, never> =>
  Effect.gen(function* () {
    const decode = Schema.decodeUnknown(contract.schema, { errors: "all" });
    const defaults = cloneValue(contract.defaults);
    const fieldNames = new Set(Object.keys(defaults));
    const snapshots = yield* SubscriptionRef.make<FormState<Values>>(createInitialState(defaults));

    const validateCurrent = (
      current: FormState<Values>,
    ): Effect.Effect<FormValidationResult<Values>, never, never> =>
      decode(current.values).pipe(
        Effect.match({
          onFailure: (issue) => ({
            _tag: "invalid",
            errors: toFormErrors<Values>(issue, fieldNames),
            issue,
          }),
          onSuccess: (values) => ({
            _tag: "valid",
            values: cloneValue(values),
          }),
        }),
      );

    const setField: FormStore<Values>["setField"] = (field, value) =>
      SubscriptionRef.update(snapshots, (current) => {
        const nextValues = {
          ...current.values,
          [field]: value,
        } as Values;

        const nextErrors: Partial<Record<FormErrorKey<Values>, string>> = {
          ...current.errors,
        };
        delete nextErrors[field];

        return {
          ...current,
          values: nextValues,
          errors: nextErrors,
          touched: {
            ...current.touched,
            [field]: true,
          },
          dirty: !deepEqual(nextValues, defaults),
          submitted: false,
        };
      }).pipe(Effect.asVoid);

    const reset: FormStore<Values>["reset"] = SubscriptionRef.set(
      snapshots,
      createInitialState(defaults),
    ).pipe(Effect.asVoid);

    const validate: FormStore<Values>["validate"] = Effect.gen(function* () {
      const current = yield* SubscriptionRef.get(snapshots);
      const result = yield* validateCurrent(current);

      if (result._tag === "valid") {
        yield* SubscriptionRef.update(snapshots, (snapshot) => ({
          ...snapshot,
          values: result.values,
          errors: {} as FormErrors<Values>,
          dirty: !deepEqual(result.values, defaults),
        }));
      } else {
        yield* SubscriptionRef.update(snapshots, (snapshot) => ({
          ...snapshot,
          errors: result.errors,
        }));
      }

      return result;
    });

    const submit: FormStore<Values>["submit"] = (handler) =>
      Effect.gen(function* () {
        yield* SubscriptionRef.update(snapshots, (current) => ({
          ...current,
          submitting: true,
          submitted: false,
        }));

        const current = yield* SubscriptionRef.get(snapshots);
        const validation = yield* validateCurrent(current);

        if (validation._tag === "invalid") {
          yield* SubscriptionRef.update(snapshots, (snapshot) => ({
            ...snapshot,
            submitting: false,
            submitted: false,
            errors: validation.errors,
          }));

          return yield* Effect.fail(new FormValidationError(validation.errors));
        }

        yield* SubscriptionRef.update(snapshots, (snapshot) => ({
          ...snapshot,
          values: validation.values,
          errors: {} as FormErrors<Values>,
          dirty: !deepEqual(validation.values, defaults),
        }));

        return yield* handler(validation.values).pipe(
          Effect.tap(() =>
            SubscriptionRef.update(snapshots, (snapshot) => ({
              ...snapshot,
              submitting: false,
              submitted: true,
            })).pipe(Effect.asVoid),
          ),
          Effect.tapError(() =>
            SubscriptionRef.update(snapshots, (snapshot) => ({
              ...snapshot,
              submitting: false,
              submitted: false,
            })).pipe(Effect.asVoid),
          ),
        );
      });

    return {
      getSnapshot: SubscriptionRef.get(snapshots),
      snapshots: snapshots.changes,
      setField,
      reset,
      validate,
      submit,
    } satisfies FormStore<Values>;
  });
