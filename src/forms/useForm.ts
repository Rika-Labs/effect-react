import { Cause, Effect, Either, Exit, ParseResult, Schema } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import { getNestedValue, setNestedValue } from "../internal/pathUtils";
import { useRuntime } from "../provider/useRuntime";

export type FormErrors<_T extends Record<string, unknown>> = Record<string, string>;
export type FormTouched<_T extends Record<string, unknown>> = Record<string, boolean>;

export interface UseFormOptions<T extends Record<string, unknown>> {
  readonly initialValues: T;
  readonly validate?: (values: T) => FormErrors<T> | Promise<FormErrors<T>>;
  readonly validateField?: <K extends keyof T>(
    field: K,
    value: T[K],
    values: T,
  ) => string | undefined | Promise<string | undefined>;
  readonly onSubmit?:
    | ((values: T) => Effect.Effect<unknown, unknown, unknown>)
    | ((values: T) => Promise<unknown>);
  readonly schema?: Schema.Schema<T, any, never>;
}

export interface RegisteredField<T extends Record<string, unknown>, K extends keyof T> {
  readonly name: K;
  readonly value: T[K];
  readonly error: string | undefined;
  readonly touched: boolean;
  readonly onChange: (value: T[K]) => void;
  readonly onBlur: () => void;
}

export interface UseFormResult<T extends Record<string, unknown>> {
  readonly values: T;
  readonly errors: FormErrors<T>;
  readonly touched: FormTouched<T>;
  readonly dirty: boolean;
  readonly isSubmitting: boolean;
  readonly setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void;
  readonly blurField: <K extends keyof T>(field: K) => void;
  readonly register: <K extends keyof T>(field: K) => RegisteredField<T, K>;
  readonly validateField: <K extends keyof T>(field: K) => Promise<boolean>;
  readonly validateForm: () => Promise<boolean>;
  readonly submit: () => Promise<boolean>;
  readonly cancelSubmit: () => void;
  readonly reset: () => void;
  readonly watch: (...fields: (keyof T)[]) => Partial<T>;
}

const shallowEqualValues = <T extends Record<string, unknown>>(left: T, right: T): boolean => {
  const leftKeys = Object.keys(left) as (keyof T)[];
  const rightKeys = Object.keys(right) as (keyof T)[];
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }
  return true;
};

const setErrorForField = <T extends Record<string, unknown>>(
  previous: FormErrors<T>,
  field: string,
  error: string | undefined,
): FormErrors<T> => {
  const next: FormErrors<T> = { ...previous };
  if (error === undefined) {
    delete next[field];
    return next;
  }
  next[field] = error;
  return next;
};

const formatLeafIssue = (issue: ParseResult.ParseIssue): string => {
  const full = ParseResult.TreeFormatter.formatIssueSync(issue);
  const lines = full.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    const cleaned = line.replace(/[└├│─]/g, "").trim();
    if (cleaned.length > 0) return cleaned;
  }
  return full;
};

const issueToArray = (
  issues: ParseResult.SingleOrNonEmpty<ParseResult.ParseIssue>,
): readonly ParseResult.ParseIssue[] =>
  Array.isArray(issues)
    ? (issues as readonly ParseResult.ParseIssue[])
    : [issues as ParseResult.ParseIssue];

const collectIssues = (
  issue: ParseResult.ParseIssue,
  path: string[],
  errors: Record<string, string>,
): void => {
  if (issue._tag === "Pointer") {
    const segments = Array.isArray(issue.path)
      ? (issue.path as PropertyKey[]).map(String)
      : [String(issue.path)];
    collectIssues(issue.issue, [...path, ...segments], errors);
  } else if (issue._tag === "Composite") {
    for (const sub of issueToArray(issue.issues)) {
      collectIssues(sub, path, errors);
    }
  } else {
    const key = path.join(".");
    if (key !== "" && errors[key] === undefined) {
      errors[key] = formatLeafIssue(issue);
    }
  }
};

const parseErrorToFormErrors = <T extends Record<string, unknown>>(
  error: ParseResult.ParseError,
): FormErrors<T> => {
  const errors: Record<string, string> = {};
  collectIssues(error.issue, [], errors);
  return errors as FormErrors<T>;
};

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { readonly then?: unknown }).then === "function";

const fromMaybePromiseEffect = <A>(
  thunk: () => A | PromiseLike<A>,
): Effect.Effect<A, unknown, never> =>
  Effect.try({
    try: thunk,
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((value) =>
      isPromiseLike<A>(value)
        ? Effect.tryPromise({
            try: () => value,
            catch: (cause) => cause,
          })
        : Effect.succeed(value),
    ),
  );

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

export const useForm = <T extends Record<string, unknown>>(
  options: UseFormOptions<T>,
): UseFormResult<T> => {
  const runtime = useRuntime();
  const { initialValues, onSubmit, validate, validateField, schema } = options;
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<FormTouched<T>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const valuesRef = useRef(values);
  const submitRunIdRef = useRef(0);
  const submitHandleRef = useRef<EffectRunHandle<unknown, unknown> | null>(null);
  const fieldValidationRunRef = useRef(new Map<keyof T, number>());

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const cancelSubmit = useCallback(() => {
    submitRunIdRef.current += 1;
    submitHandleRef.current?.cancel();
    submitHandleRef.current = null;
    setIsSubmitting(false);
  }, []);

  useEffect(
    () => () => {
      cancelSubmit();
    },
    [cancelSubmit],
  );

  const effectiveValidate = useMemo(() => {
    if (validate) return validate;
    if (schema) {
      return (vals: T): FormErrors<T> => {
        const result = Schema.decodeUnknownEither(schema, { errors: "all" })(vals);
        if (Either.isRight(result)) return {};
        return parseErrorToFormErrors(result.left);
      };
    }
    return undefined;
  }, [validate, schema]);

  const setFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    const fieldStr = field as string;
    let next: T;
    if (fieldStr.includes(".")) {
      next = setNestedValue(valuesRef.current, fieldStr, value);
    } else {
      next = {
        ...valuesRef.current,
        [field]: value,
      };
    }
    valuesRef.current = next;
    setValues(next);
  }, []);

  const blurField = useCallback(<K extends keyof T>(field: K) => {
    setTouched((previous) => ({
      ...previous,
      [field]: true,
    }));
  }, []);

  const runValidateFormEffect = useCallback((): Effect.Effect<FormErrors<T>, unknown, never> => {
    if (!effectiveValidate) {
      return Effect.succeed({});
    }
    return fromMaybePromiseEffect(() => effectiveValidate(valuesRef.current));
  }, [effectiveValidate]);

  const validateFormFn = useCallback(
    (): Promise<boolean> =>
      runEffectWithSquashedCause(
        runValidateFormEffect().pipe(
          Effect.tap((nextErrors) =>
            Effect.sync(() => {
              setErrors(nextErrors);
            }),
          ),
          Effect.map((nextErrors) => Object.keys(nextErrors).length === 0),
        ),
      ),
    [runValidateFormEffect],
  );

  const validateFieldFn = useCallback(
    <K extends keyof T>(field: K): Promise<boolean> =>
      runEffectWithSquashedCause(
        Effect.gen(function* () {
          const currentRunId = (fieldValidationRunRef.current.get(field) ?? 0) + 1;
          fieldValidationRunRef.current.set(field, currentRunId);

          const currentValues = valuesRef.current;
          const nextError = yield* validateField
            ? fromMaybePromiseEffect(() =>
                validateField(field, currentValues[field], currentValues),
              )
            : effectiveValidate
              ? runValidateFormEffect().pipe(
                  Effect.map((allErrors) => allErrors[field as string] as string | undefined),
                )
              : Effect.succeed<string | undefined>(undefined);

          if (fieldValidationRunRef.current.get(field) !== currentRunId) {
            return false;
          }

          yield* Effect.sync(() => {
            setErrors((previous) => setErrorForField(previous, String(field), nextError));
          });
          return nextError === undefined;
        }),
      ),
    [effectiveValidate, runValidateFormEffect, validateField],
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const valid = await validateFormFn();
    if (!valid) {
      return false;
    }
    if (!onSubmit) {
      return true;
    }

    submitRunIdRef.current += 1;
    const runId = submitRunIdRef.current;
    setIsSubmitting(true);

    try {
      const submitResult = onSubmit(valuesRef.current);
      if (Effect.isEffect(submitResult)) {
        const handle = runEffect(runtime, submitResult);
        submitHandleRef.current = handle as EffectRunHandle<unknown, unknown>;
        const exit = await handle.promise;
        if (submitRunIdRef.current !== runId) {
          return false;
        }
        submitHandleRef.current = null;
        return Exit.isSuccess(exit);
      }
      await runEffectWithSquashedCause(fromMaybePromiseEffect(() => submitResult));
      if (submitRunIdRef.current !== runId) {
        return false;
      }
      return true;
    } catch {
      if (submitRunIdRef.current !== runId) {
        return false;
      }
      return false;
    } finally {
      if (submitRunIdRef.current === runId) {
        setIsSubmitting(false);
      }
    }
  }, [onSubmit, runtime, validateFormFn]);

  const reset = useCallback(() => {
    cancelSubmit();
    valuesRef.current = initialValues;
    setValues(initialValues);
    setErrors({});
    setTouched({});
    fieldValidationRunRef.current.clear();
  }, [cancelSubmit, initialValues]);

  const dirty = useMemo(() => !shallowEqualValues(values, initialValues), [initialValues, values]);

  const register = useCallback(
    <K extends keyof T>(field: K): RegisteredField<T, K> => {
      const fieldStr = field as string;
      const fieldValue = fieldStr.includes(".")
        ? (getNestedValue(values, fieldStr) as T[K])
        : values[field];
      return {
        name: field,
        value: fieldValue,
        error: errors[fieldStr],
        touched: touched[fieldStr] === true,
        onChange: (value) => {
          setFieldValue(field, value);
        },
        onBlur: () => {
          blurField(field);
        },
      };
    },
    [blurField, errors, setFieldValue, touched, values],
  );

  const watch = useCallback(
    (...fields: (keyof T)[]): Partial<T> => {
      if (fields.length === 0) {
        return { ...values };
      }
      const result: Partial<T> = {};
      for (const field of fields) {
        result[field] = values[field];
      }
      return result;
    },
    [values],
  );

  return {
    values,
    errors,
    touched,
    dirty,
    isSubmitting,
    setFieldValue,
    blurField,
    register,
    validateField: validateFieldFn,
    validateForm: validateFormFn,
    submit,
    cancelSubmit,
    reset,
    watch,
  };
};
