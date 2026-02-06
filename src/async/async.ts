import { Cause, Effect, Exit } from "effect";

export interface LatestTokenGuard {
  readonly issue: () => number;
  readonly isCurrent: (token: number) => boolean;
  readonly invalidate: () => void;
  readonly current: () => number;
}

export const createLatestTokenGuard = (): LatestTokenGuard => {
  let token = 0;
  return {
    issue: () => {
      token += 1;
      return token;
    },
    isCurrent: (value) => value === token,
    invalidate: () => {
      token += 1;
    },
    current: () => token,
  };
};

export type LatestResult<A> =
  | { readonly stale: false; readonly value: A }
  | { readonly stale: true };

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

export const runLatestEffect = <A>(
  guard: LatestTokenGuard,
  task: () => Promise<A>,
): Effect.Effect<LatestResult<A>, unknown, never> =>
  Effect.gen(function* () {
    const token = guard.issue();
    const value = yield* Effect.tryPromise({
      try: task,
      catch: (cause) => cause,
    });
    if (!guard.isCurrent(token)) {
      return { stale: true };
    }
    return { stale: false, value };
  });

export const runLatestPromise = <A>(
  guard: LatestTokenGuard,
  task: () => Promise<A>,
): Promise<LatestResult<A>> => runEffectWithSquashedCause(runLatestEffect(guard, task));
