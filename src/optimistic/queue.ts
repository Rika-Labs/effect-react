import { Cause, Effect, Exit } from "effect";

export interface OptimisticMutation<S, A = unknown> {
  readonly id?: string;
  readonly apply: (state: S) => S;
  readonly rollback: (state: S) => S;
  readonly execute: () => A | Promise<A>;
}

interface PendingMutation<S> {
  readonly id: string;
  readonly apply: (state: S) => S;
  readonly rollback: (state: S) => S;
  readonly execute: () => unknown;
}

export interface OptimisticQueue<S> {
  readonly getState: () => S;
  readonly setState: (state: S) => void;
  readonly pendingIds: () => readonly string[];
}

export interface ReplayResult {
  readonly completed: readonly string[];
  readonly failed: readonly string[];
}

export interface ReplayOptions {
  readonly continueOnError?: boolean;
}

const pendingRegistry = new WeakMap<object, Map<string, PendingMutation<unknown>>>();

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === "object" &&
  value !== null &&
  "then" in value &&
  typeof (value as { readonly then?: unknown }).then === "function";

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

const executeEntryEffect = <S>(entry: PendingMutation<S>): Effect.Effect<void, unknown, never> =>
  Effect.try({
    try: () => entry.execute(),
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((result) =>
      isPromiseLike<unknown>(result)
        ? Effect.tryPromise({
            try: () => result,
            catch: (cause) => cause,
          })
        : Effect.succeed(result),
    ),
    Effect.asVoid,
  );

const getPendingMap = <S>(queue: OptimisticQueue<S>): Map<string, PendingMutation<S>> => {
  const pending = pendingRegistry.get(queue as unknown as object);
  if (pending === undefined) {
    throw new Error("Unknown optimistic queue");
  }
  return pending as Map<string, PendingMutation<S>>;
};

let nextMutationId = 0;

const allocateId = (): string => {
  nextMutationId += 1;
  return `optimistic-${String(nextMutationId)}`;
};

export const createOptimisticQueue = <S>(initialState: S): OptimisticQueue<S> => {
  let state = initialState;
  const pending = new Map<string, PendingMutation<unknown>>();

  const queue: OptimisticQueue<S> = {
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    pendingIds: () => Array.from(pending.keys()),
  };

  pendingRegistry.set(queue as unknown as object, pending);
  return queue;
};

export const enqueueOptimisticMutation = <S, A>(
  queue: OptimisticQueue<S>,
  mutation: OptimisticMutation<S, A>,
): string => {
  const pending = getPendingMap(queue);
  const id = mutation.id ?? allocateId();
  pending.set(id, {
    id,
    apply: mutation.apply,
    rollback: mutation.rollback,
    execute: mutation.execute,
  });
  queue.setState(mutation.apply(queue.getState()));
  return id;
};

export const rollbackOptimisticMutation = <S>(queue: OptimisticQueue<S>, id: string): boolean => {
  const pending = getPendingMap(queue);
  const mutation = pending.get(id);
  if (mutation === undefined) {
    return false;
  }
  queue.setState(mutation.rollback(queue.getState()));
  pending.delete(id);
  return true;
};

export const replayPendingMutationsEffect = <S>(
  queue: OptimisticQueue<S>,
  options: ReplayOptions = {},
): Effect.Effect<ReplayResult, never, never> => {
  const pending = getPendingMap(queue);
  const completed: string[] = [];
  const failed: string[] = [];
  const entries = Array.from(pending.values());

  const runNext = (index: number): Effect.Effect<ReplayResult, never, never> => {
    if (index >= entries.length) {
      return Effect.succeed({
        completed,
        failed,
      });
    }

    const entry = entries[index]!;
    return Effect.matchEffect(executeEntryEffect(entry), {
      onFailure: () => {
        queue.setState(entry.rollback(queue.getState()));
        pending.delete(entry.id);
        failed.push(entry.id);
        if (options.continueOnError !== true) {
          return Effect.succeed({
            completed,
            failed,
          });
        }
        return runNext(index + 1);
      },
      onSuccess: () => {
        pending.delete(entry.id);
        completed.push(entry.id);
        return runNext(index + 1);
      },
    });
  };

  return runNext(0);
};

export const replayPendingMutations = <S>(
  queue: OptimisticQueue<S>,
  options: ReplayOptions = {},
): Promise<ReplayResult> =>
  runEffectWithSquashedCause(replayPendingMutationsEffect(queue, options));
