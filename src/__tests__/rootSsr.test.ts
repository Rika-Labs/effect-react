import { describe, expect, it } from "vitest";
import { QueryCache } from "../query/QueryCache";
import { DEHYDRATED_STATE_VERSION } from "../query/types";
import { dehydrate, hydrate } from "../ssr";

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
});
