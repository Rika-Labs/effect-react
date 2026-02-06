import type { QueryCache } from "../query/QueryCache";
import type { DehydratedState } from "../query/types";
import { dehydrate as queryDehydrate } from "../query/ssr";
import type { RouteLoaderSnapshot } from "../router/loader";

export const dehydrate = (cache: QueryCache): DehydratedState => queryDehydrate(cache);

export const FRAMEWORK_HYDRATION_VERSION = 1 as const;

export interface FrameworkHydrationState {
  readonly version: typeof FRAMEWORK_HYDRATION_VERSION;
  readonly query: DehydratedState;
  readonly loaderState: RouteLoaderSnapshot;
}

export interface DehydrateFrameworkStateOptions {
  readonly cache: QueryCache;
  readonly loaderState?: RouteLoaderSnapshot;
}

export const dehydrateFrameworkState = (
  options: DehydrateFrameworkStateOptions,
): FrameworkHydrationState => ({
  version: FRAMEWORK_HYDRATION_VERSION,
  query: queryDehydrate(options.cache),
  loaderState: options.loaderState ?? {},
});

export const encodeFrameworkHydrationState = (state: FrameworkHydrationState): string =>
  JSON.stringify(state).replace(/</g, "\\u003c");

export const createFrameworkHydrationScript = (
  state: FrameworkHydrationState,
  globalName = "__EFFECT_REACT_STATE__",
): string => `window[${JSON.stringify(globalName)}]=${encodeFrameworkHydrationState(state)};`;
