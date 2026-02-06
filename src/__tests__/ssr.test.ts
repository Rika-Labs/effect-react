import { describe, expect, it } from "vitest";
import { QueryCache } from "../query/QueryCache";
import { dehydrate, hydrate } from "../query/ssr";
import { DEHYDRATED_STATE_VERSION } from "../query/types";

describe("ssr helpers", () => {
  it("dehydrates and hydrates through helper functions", () => {
    const source = new QueryCache();
    source.setQueryData(["ssr"], "value");

    const state = dehydrate(source);
    expect(state.version).toBe(DEHYDRATED_STATE_VERSION);
    const target = new QueryCache();
    hydrate(target, state);

    expect(target.getQueryData<string>(["ssr"])).toBe("value");
  });
});
