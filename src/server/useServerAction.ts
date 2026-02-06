import type { Cause } from "effect";
import { useMutation } from "../mutation";
import type { MutationInvalidationTarget, MutationResult } from "../mutation/types";
import {
  callServerAction,
  type AnyServerAction,
  type ServerActionError,
  type ServerActionInput,
  type ServerActionOutput,
  type ServerActionTransport,
  type ServerActionDefectError,
  type ServerActionTransportError,
  type ServerActionValidationError,
} from "./actions";

export type ServerActionHookError<TAction extends AnyServerAction> =
  | ServerActionError<TAction>
  | ServerActionTransportError
  | ServerActionDefectError
  | ServerActionValidationError;

export interface UseServerActionOptions<TAction extends AnyServerAction> {
  readonly action: TAction;
  readonly transport: ServerActionTransport;
  readonly invalidate?: readonly MutationInvalidationTarget[];
  readonly onSuccess?: (
    value: ServerActionOutput<TAction>,
    input: ServerActionInput<TAction>,
  ) => void | Promise<void>;
  readonly onError?: (
    cause: Cause.Cause<ServerActionHookError<TAction>>,
    input: ServerActionInput<TAction>,
  ) => void | Promise<void>;
  readonly onSettled?: (
    result: MutationResult<ServerActionOutput<TAction>, ServerActionHookError<TAction>>,
    input: ServerActionInput<TAction>,
  ) => void | Promise<void>;
}

export const useServerAction = <TAction extends AnyServerAction>(
  options: UseServerActionOptions<TAction>,
) =>
  useMutation<
    ServerActionInput<TAction>,
    ServerActionOutput<TAction>,
    ServerActionHookError<TAction>,
    never
  >({
    mutation: (input) => callServerAction(options.transport, options.action, input),
    ...(options.invalidate !== undefined ? { invalidate: options.invalidate } : {}),
    ...(options.onSuccess !== undefined ? { onSuccess: options.onSuccess } : {}),
    ...(options.onError !== undefined ? { onError: options.onError } : {}),
    ...(options.onSettled !== undefined ? { onSettled: options.onSettled } : {}),
  });
