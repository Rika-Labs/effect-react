import { describe, expect, it } from "vitest";
import { QueryCache } from "../query/QueryCache";
import { DEHYDRATED_STATE_VERSION } from "../query/types";
import {
  createFrameworkHydrationScript,
  decodeFrameworkHydrationState,
  dehydrate,
  dehydrateFrameworkState,
  hydrate,
  hydrateFrameworkState,
  parseFrameworkHydrationState,
} from "../ssr";

describe("root ssr helpers", () => {
  it("dehydrates and hydrates through top-level ssr exports", () => {
    const source = new QueryCache({ defaultStaleTime: 1000, defaultGcTime: 2000 });
    source.setQueryData(["ssr"], { value: 1 });

    const state = dehydrate(source);
    expect(state.version).toBe(DEHYDRATED_STATE_VERSION);

    const target = new QueryCache();
    hydrate(target, state);

    expect(target.getQueryData<{ readonly value: number }>(["ssr"])).toEqual({ value: 1 });
  });

  it("round-trips framework hydration state including loader snapshot", () => {
    const source = new QueryCache();
    source.setQueryData(["profile"], { id: "u1" });

    const state = dehydrateFrameworkState({
      cache: source,
      loaderState: {
        profile: {
          _tag: "success",
          value: { id: "u1" },
        },
      },
    });

    const script = createFrameworkHydrationScript(state);
    expect(script).toContain("__EFFECT_REACT_STATE__");

    const encoded = script.slice(script.indexOf("=") + 1, script.lastIndexOf(";"));
    const decodedFromParse = parseFrameworkHydrationState(encoded);
    expect(decodedFromParse).toEqual(state);
    expect(decodeFrameworkHydrationState(decodedFromParse)).toEqual(state);

    const target = new QueryCache();
    const loaderState = hydrateFrameworkState({
      cache: target,
      state,
    });

    expect(target.getQueryData<{ readonly id: string }>(["profile"])).toEqual({ id: "u1" });
    expect(loaderState["profile"]).toEqual({
      _tag: "success",
      value: { id: "u1" },
    });
  });

  it("rejects invalid framework hydration payloads", () => {
    expect(parseFrameworkHydrationState("{")).toBeUndefined();
    expect(decodeFrameworkHydrationState({})).toBeUndefined();
    expect(
      decodeFrameworkHydrationState({
        version: 999,
        query: {},
        loaderState: {},
      }),
    ).toBeUndefined();
    expect(
      decodeFrameworkHydrationState({
        version: 1,
        query: "bad",
        loaderState: {},
      }),
    ).toBeUndefined();
    expect(
      decodeFrameworkHydrationState({
        version: 1,
        query: {},
        loaderState: "bad",
      }),
    ).toBeUndefined();
  });
});
