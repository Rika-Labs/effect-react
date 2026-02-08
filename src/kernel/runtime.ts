import { ManagedRuntime, type Runtime } from "effect";
import type { Layer } from "effect";

export type AppManagedRuntime<R> = ManagedRuntime.ManagedRuntime<R, never>;

export const createManagedRuntime = <R>(layer: Layer.Layer<R, never, never>): AppManagedRuntime<R> =>
  ManagedRuntime.make(layer);

export type RuntimeHandle<R> = Runtime.Runtime<R>;
