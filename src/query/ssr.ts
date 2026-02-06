import type { QueryCache } from "./QueryCache";
import type { DehydratedState } from "./types";

export const dehydrate = (cache: QueryCache): DehydratedState => cache.dehydrate();

export const hydrate = (cache: QueryCache, state: DehydratedState): void => {
  cache.hydrate(state);
};
