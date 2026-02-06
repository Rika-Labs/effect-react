import type { QueryCache } from "../query/QueryCache";
import type { DehydratedState } from "../query/types";
import { hydrate as queryHydrate } from "../query/ssr";
import type { RouteLoaderSnapshot } from "../router/loader";
import { FRAMEWORK_HYDRATION_VERSION, type FrameworkHydrationState } from "./dehydrate";

export const hydrate = (cache: QueryCache, state: DehydratedState): void => {
  queryHydrate(cache, state);
};

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
};

const isLoaderState = (value: unknown): value is RouteLoaderSnapshot =>
  asRecord(value) !== undefined;

export const decodeFrameworkHydrationState = (
  value: unknown,
): FrameworkHydrationState | undefined => {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }

  if (record["version"] !== FRAMEWORK_HYDRATION_VERSION) {
    return undefined;
  }

  const query = record["query"];
  const loaderState = record["loaderState"];
  if (asRecord(query) === undefined || !isLoaderState(loaderState)) {
    return undefined;
  }

  return {
    version: FRAMEWORK_HYDRATION_VERSION,
    query: query as DehydratedState,
    loaderState,
  };
};

export interface HydrateFrameworkStateOptions {
  readonly cache: QueryCache;
  readonly state: FrameworkHydrationState;
}

export const hydrateFrameworkState = (
  options: HydrateFrameworkStateOptions,
): RouteLoaderSnapshot => {
  queryHydrate(options.cache, options.state.query);
  return options.state.loaderState;
};

export const parseFrameworkHydrationState = (text: string): FrameworkHydrationState | undefined => {
  try {
    return decodeFrameworkHydrationState(JSON.parse(text));
  } catch {
    return undefined;
  }
};
