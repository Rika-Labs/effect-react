import type { QueryCache } from "../query/QueryCache";
import type { DehydratedState } from "../query/types";
import { hydrate as queryHydrate } from "../query/ssr";

export const hydrate = (cache: QueryCache, state: DehydratedState): void => {
  queryHydrate(cache, state);
};
