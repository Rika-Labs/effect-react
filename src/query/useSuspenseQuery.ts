import { Cause } from "effect";
import { useQueryCache } from "./context";
import type { QueryResult, UseQueryOptions, UseQueryResult } from "./types";
import { useQuery } from "./useQuery";

const pendingByHash = new Map<string, Promise<void>>();

const ensurePending = (hash: string, load: () => Promise<void>): Promise<void> => {
  const current = pendingByHash.get(hash);
  if (current) {
    return current;
  }
  const pending = load().finally(() => {
    pendingByHash.delete(hash);
  });
  pendingByHash.set(hash, pending);
  return pending;
};

export class SuspenseQueryError<E> extends Error {
  readonly queryCause: Cause.Cause<E>;

  constructor(cause: Cause.Cause<E>) {
    super("Suspense query failed");
    this.name = "SuspenseQueryError";
    this.queryCause = cause;
  }
}

export const isSuspenseQueryError = <E>(error: unknown): error is SuspenseQueryError<E> =>
  error instanceof SuspenseQueryError;

export interface UseSuspenseQueryResult<A, E>
  extends
    Omit<UseQueryResult<A, E>, "data" | "status">,
    Omit<QueryResult<A, E>, "data" | "status"> {
  readonly data: A;
  readonly status: "success" | "refreshing";
}

export const useSuspenseQuery = <A, E, R, S = A>(
  options: UseQueryOptions<A, E, R, S>,
): UseSuspenseQueryResult<S, E> => {
  const cache = useQueryCache();
  const query = useQuery(options);
  const hash = (options.keyHasher ?? cache.keyHasher)(options.key);

  if (query.status === "initial" || query.status === "loading") {
    throw ensurePending(hash, query.refetch);
  }

  if (query.status === "failure") {
    throw new SuspenseQueryError(query.cause ?? (Cause.empty as Cause.Cause<E>));
  }

  pendingByHash.delete(hash);

  if (query.data === undefined) {
    throw ensurePending(hash, query.refetch);
  }

  return {
    ...query,
    data: query.data,
    status: query.status === "refreshing" ? "refreshing" : "success",
  };
};
