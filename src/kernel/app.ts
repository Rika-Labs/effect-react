import { Layer } from "effect";
import { type AnyActionDefinition, makeActionsLayer } from "../actions";
import type { Actions } from "../actions";
import { BoundaryLive } from "../boundary";
import type { Boundary } from "../boundary";
import { makeDataLayer, type QueryRuntimeOptions } from "../data";
import type { Data } from "../data";
import {
  makeNavigationLayer,
  type AnyLoaderDefinition,
  type AnyRouteDefinition,
} from "../navigation";
import type { Navigation } from "../navigation";
import { createManagedRuntime, type AppManagedRuntime } from "./runtime";
import { TelemetryLive, type TelemetryEvent } from "./telemetry";
import type { Telemetry } from "./telemetry";
import type { Stream } from "effect";

export interface CreateAppLayerOptions {
  readonly routes: readonly AnyRouteDefinition[];
  readonly actions?: readonly AnyActionDefinition[];
  readonly loaders?: readonly AnyLoaderDefinition[];
  readonly initialHref?: string;
  readonly data?: QueryRuntimeOptions;
}

export type AppServices = Boundary | Data | Actions | Navigation | Telemetry;

export type AppLayer = Layer.Layer<
  AppServices,
  never,
  never
>;

export const createAppLayer = (options: CreateAppLayerOptions): AppLayer => {
  const boundaryLayer = BoundaryLive;
  const telemetryLayer = TelemetryLive;

  const dataLayer = makeDataLayer(options.data).pipe(
    Layer.provide([boundaryLayer, telemetryLayer]),
  );

  const actionsLayer = makeActionsLayer({
    actions: options.actions ?? [],
  }).pipe(Layer.provide([boundaryLayer, telemetryLayer]));

  const navigationLayer = makeNavigationLayer({
    routes: options.routes,
    ...(options.loaders !== undefined ? { loaders: options.loaders } : {}),
    ...(options.initialHref !== undefined ? { initialHref: options.initialHref } : {}),
  }).pipe(Layer.provide([boundaryLayer, telemetryLayer]));

  return Layer.mergeAll(boundaryLayer, telemetryLayer, dataLayer, actionsLayer, navigationLayer);
};

export const createAppRuntime = (options: CreateAppLayerOptions): AppManagedRuntime<AppServices> =>
  createManagedRuntime(createAppLayer(options));

export interface FrameworkEventStream {
  readonly stream: Stream.Stream<TelemetryEvent>;
}
