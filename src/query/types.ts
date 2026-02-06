import type { Cause, Effect } from "effect";
import type { DurationInput } from "../internal/duration";
import type { KeyHasher } from "../internal/keyHash";

export type QueryKey = readonly unknown[];

export type QueryStatus = "initial" | "loading" | "success" | "failure" | "refreshing";

export interface QueryResult<A, E> {
  readonly status: QueryStatus;
  readonly data: A | undefined;
  readonly cause: Cause.Cause<E> | undefined;
  readonly updatedAt: number | null;
  readonly isStale: boolean;
  readonly isFetching: boolean;
}

export interface UseQueryOptions<A, E, R, S = A> {
  readonly key: QueryKey;
  readonly query: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>);
  readonly enabled?: boolean;
  readonly staleTime?: DurationInput;
  readonly gcTime?: DurationInput;
  readonly initialData?: A;
  readonly placeholderData?: S;
  readonly select?: (data: A) => S;
  readonly keepPreviousData?: boolean;
  readonly refetchOnWindowFocus?: boolean;
  readonly refetchOnReconnect?: boolean;
  readonly keyHasher?: KeyHasher;
  readonly structuralSharing?: boolean;
}

export interface UseQueryResult<A, E> extends QueryResult<A, E> {
  readonly refetch: () => Promise<void>;
  readonly invalidate: () => void;
}

export interface QueryFilters {
  readonly key?: QueryKey;
  readonly predicate?: (key: QueryKey) => boolean;
  readonly status?: QueryStatus | readonly QueryStatus[];
  readonly stale?: boolean;
}

export interface InfiniteData<A, P = unknown> {
  readonly pages: readonly A[];
  readonly pageParams: readonly P[];
}

export interface UseInfiniteQueryOptions<A, E, R, P = unknown> {
  readonly key: QueryKey;
  readonly query: (context: { pageParam: P }) => Effect.Effect<A, E, R>;
  readonly getNextPageParam: (lastPage: A, allPages: readonly A[]) => P | undefined | null;
  readonly getPreviousPageParam?: (firstPage: A, allPages: readonly A[]) => P | undefined | null;
  readonly initialPageParam: P;
  readonly enabled?: boolean;
  readonly staleTime?: DurationInput;
  readonly gcTime?: DurationInput;
  readonly keyHasher?: KeyHasher;
}

export interface InfiniteQueryResult<A, E, P = unknown> extends QueryResult<InfiniteData<A, P>, E> {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchingPreviousPage: boolean;
  readonly fetchNextPage: () => Promise<void>;
  readonly fetchPreviousPage: () => Promise<void>;
  readonly refetch: () => Promise<void>;
  readonly invalidate: () => void;
}

export const DEHYDRATED_STATE_VERSION = 1 as const;

export interface DehydratedQuery {
  readonly key: QueryKey;
  readonly hash: string;
  readonly data: unknown;
  readonly updatedAt: number;
  readonly staleTimeMs: number;
  readonly gcTimeMs: number;
  readonly isStale: boolean;
}

export interface DehydratedState {
  readonly version: typeof DEHYDRATED_STATE_VERSION;
  readonly queries: readonly DehydratedQuery[];
}
