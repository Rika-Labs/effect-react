import type { Cause, Effect } from "effect";
import type { QueryKey } from "../query/types";

export type MutationStatus = "initial" | "pending" | "success" | "failure";

export interface MutationResult<A, E> {
  readonly status: MutationStatus;
  readonly data: A | undefined;
  readonly cause: Cause.Cause<E> | undefined;
  readonly submittedAt: number | null;
}

export type MutationInvalidationTarget = QueryKey | ((key: QueryKey) => boolean);

export interface MutationOptimisticOptions<V, E> {
  readonly apply: (variables: V) => void;
  readonly rollback: (variables: V, cause: Cause.Cause<E>) => void;
}

export interface UseMutationOptions<V, A, E, R> {
  readonly mutation: ((variables: V) => Effect.Effect<A, E, R>) | Effect.Effect<A, E, R>;
  readonly invalidate?: readonly MutationInvalidationTarget[] | undefined;
  readonly optimistic?: MutationOptimisticOptions<V, E>;
  readonly onSuccess?: (data: A, variables: V) => void | Promise<void>;
  readonly onError?: (cause: Cause.Cause<E>, variables: V) => void | Promise<void>;
  readonly onSettled?: (result: MutationResult<A, E>, variables: V) => void | Promise<void>;
}

export interface UseMutationResult<V, A, E> extends MutationResult<A, E> {
  readonly mutate: (variables: V) => Promise<A>;
  readonly cancel: () => void;
  readonly reset: () => void;
}
