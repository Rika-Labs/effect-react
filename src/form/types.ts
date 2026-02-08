import type { Effect, ParseResult, Schema, Stream } from "effect";

export type FormValues = Readonly<Record<string, unknown>>;

export type FormFieldName<Values extends FormValues> = Extract<keyof Values, string>;

export type FormErrorKey<Values extends FormValues> = FormFieldName<Values> | "_form";

export type FormErrors<Values extends FormValues> = Readonly<
  Partial<Record<FormErrorKey<Values>, string>>
>;

export type FormTouched<Values extends FormValues> = Readonly<
  Partial<Record<FormFieldName<Values>, boolean>>
>;

export interface FormContract<Values extends FormValues, Encoded = Values> {
  readonly schema: Schema.Schema<Values, Encoded, never>;
  readonly defaults: Values;
}

export const defineForm = <Values extends FormValues, Encoded = Values>(
  contract: FormContract<Values, Encoded>,
): FormContract<Values, Encoded> => contract;

export interface FormState<Values extends FormValues> {
  readonly values: Values;
  readonly errors: FormErrors<Values>;
  readonly touched: FormTouched<Values>;
  readonly dirty: boolean;
  readonly submitting: boolean;
  readonly submitted: boolean;
}

export type FormValidationResult<Values extends FormValues> =
  | {
      readonly _tag: "valid";
      readonly values: Values;
    }
  | {
      readonly _tag: "invalid";
      readonly errors: FormErrors<Values>;
      readonly issue: ParseResult.ParseError;
    };

export class FormValidationError<Values extends FormValues> extends Error {
  readonly _tag = "FormValidationError" as const;

  constructor(readonly errors: FormErrors<Values>) {
    super("Form validation failed");
    this.name = "FormValidationError";
  }
}

export type FormSubmitHandler<Values extends FormValues, A, E, R = never> = (
  values: Values,
) => Effect.Effect<A, E, R>;

export interface FormStore<Values extends FormValues> {
  readonly getSnapshot: Effect.Effect<FormState<Values>, never, never>;
  readonly snapshots: Stream.Stream<FormState<Values>>;
  readonly setField: <Field extends FormFieldName<Values>>(
    field: Field,
    value: Values[Field],
  ) => Effect.Effect<void, never, never>;
  readonly reset: Effect.Effect<void, never, never>;
  readonly validate: Effect.Effect<FormValidationResult<Values>, never, never>;
  readonly submit: <A, E, R = never>(
    handler: FormSubmitHandler<Values, A, E, R>,
  ) => Effect.Effect<A, E | FormValidationError<Values>, R>;
}
