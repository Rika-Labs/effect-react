import { describe, expect, it } from "vitest";
import {
  createSearchAdapter,
  defineSearchSchema,
  numberCodec,
  parseSearch,
  serializeSearch,
} from "../url-state";

const schema = defineSearchSchema({
  page: numberCodec,
});

describe("url search branches", () => {
  it("parses URLSearchParams instances and raw query text", () => {
    const fromParams = parseSearch(new URLSearchParams("page=4"), schema);
    const fromRawString = parseSearch("page=6", schema);

    expect(fromParams["page"]).toBe(4);
    expect(fromRawString["page"]).toBe(6);
  });

  it("serializes empty and non-empty values through schema adapters", () => {
    const adapter = createSearchAdapter(schema);

    expect(serializeSearch({}, schema)).toBe("");
    expect(adapter.serialize({}).toString()).toBe("");
    expect(adapter.serialize({ page: 9 }).toString()).toBe("page=9");
  });
});
