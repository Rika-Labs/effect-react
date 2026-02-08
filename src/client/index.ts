import { Effect } from "effect";
import type { EffectReactApp } from "../framework";
import { hydrateAppState } from "../render";

export interface HydrateAppOptions {
  readonly app: EffectReactApp;
  readonly payload?: unknown;
  readonly globalName?: string;
}

export const defaultHydrationGlobalName = "__effectReactHydration";

const readGlobalHydrationPayload = (globalName: string): unknown => {
  const globalScope = globalThis as Record<string, unknown>;
  return globalScope[globalName];
};

export const hydrateApp = (options: HydrateAppOptions): Promise<void> => {
  const payload =
    options.payload ??
    readGlobalHydrationPayload(options.globalName ?? defaultHydrationGlobalName);

  if (payload === undefined) {
    return options.app.runtime.runPromise(Effect.void);
  }

  return options.app.runtime.runPromise(hydrateAppState(payload));
};
