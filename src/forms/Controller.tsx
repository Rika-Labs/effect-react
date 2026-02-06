import type { ReactNode } from "react";
import type { RegisteredField, UseFormResult } from "./useForm";

export interface ControllerProps<T extends Record<string, unknown>, K extends keyof T> {
  readonly name: K;
  readonly form: UseFormResult<T>;
  readonly render: (field: RegisteredField<T, K>) => ReactNode;
}

export const Controller = <T extends Record<string, unknown>, K extends keyof T>(
  props: ControllerProps<T, K>,
): ReactNode => props.render(props.form.register(props.name));
