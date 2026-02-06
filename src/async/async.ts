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

export const runLatestPromise = async <A>(
  guard: LatestTokenGuard,
  task: () => Promise<A>,
): Promise<LatestResult<A>> => {
  const token = guard.issue();
  const value = await task();
  if (!guard.isCurrent(token)) {
    return { stale: true };
  }
  return { stale: false, value };
};
