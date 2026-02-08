import { Effect, Schema } from "effect";
import { Boundary } from "../boundary";
import { Data } from "../data/service";
import type { QuerySnapshot } from "../data/types";
import { Navigation } from "../navigation/service";
import { parseHref } from "../navigation/matcher";

export interface HydrationState {
  readonly version: 1;
  readonly data: readonly (readonly [string, QuerySnapshot<unknown, unknown>])[];
  readonly navigationHref: string;
}

const QuerySnapshotSchema = Schema.Struct({
  key: Schema.String,
  phase: Schema.Union(
    Schema.Literal("initial"),
    Schema.Literal("loading"),
    Schema.Literal("success"),
    Schema.Literal("failure"),
  ),
  data: Schema.NullishOr(Schema.Unknown),
  error: Schema.NullishOr(Schema.Unknown),
  updatedAt: Schema.NullishOr(Schema.Number),
});

export const HydrationStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  data: Schema.Array(Schema.Tuple(Schema.String, QuerySnapshotSchema)),
  navigationHref: Schema.String,
});

const escapeForScript = (value: string): string =>
  value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export const dehydrateAppState = (): Effect.Effect<HydrationState, never, Data | Navigation> =>
  Effect.gen(function* () {
    const data = yield* Data;
    const navigation = yield* Navigation;

    const snapshots = yield* data.getAllSnapshots;
    const navigationSnapshot = yield* navigation.getSnapshot;

    return {
      version: 1,
      data: Array.from(snapshots.entries()),
      navigationHref: navigationSnapshot.href,
    } satisfies HydrationState;
  });

export const createHydrationScript = (
  state: HydrationState,
  globalName = "__effectReactHydration",
): string => {
  const serialized = JSON.stringify(state);
  return `window[${JSON.stringify(globalName)}]=JSON.parse(${JSON.stringify(escapeForScript(serialized))});`;
};

export const hydrateAppState = (
  payload: unknown,
): Effect.Effect<void, unknown, Boundary | Data | Navigation> =>
  Effect.gen(function* () {
    const boundary = yield* Boundary;
    const data = yield* Data;
    const navigation = yield* Navigation;

    const decoded = yield* boundary.decodeUnknown({
      source: "hydration:payload",
      schema: HydrationStateSchema,
      value: payload,
    });

    const mapped = new Map<string, QuerySnapshot<unknown, unknown>>(decoded.data);
    yield* data.hydrateSnapshots(mapped);

    const current = yield* navigation.getSnapshot;
    const parsed = parseHref(decoded.navigationHref);

    yield* navigation.hydrateSnapshot({
      ...current,
      pathname: parsed.pathname,
      searchText: parsed.searchText,
      href: decoded.navigationHref,
      status: "success",
      match: null,
      loaders: {},
      error: undefined,
    });
  });
