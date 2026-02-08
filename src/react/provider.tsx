import type { ManagedRuntime } from "effect";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { AppServices } from "../kernel/app";

export type EffectReactManagedRuntime<R = AppServices> = ManagedRuntime.ManagedRuntime<R, never>;

const RuntimeContext = createContext<EffectReactManagedRuntime | null>(null);

export interface EffectProviderProps {
  readonly runtime: EffectReactManagedRuntime;
  readonly children?: ReactNode;
}

export const EffectProvider = ({ runtime, children }: EffectProviderProps) => {
  useEffect(
    () => () => {
      void runtime.dispose();
    },
    [runtime],
  );

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
};

export const useEffectRuntime = (): EffectReactManagedRuntime => {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error("Effect runtime is not available. Wrap your app with <EffectProvider>.");
  }
  return runtime;
};
