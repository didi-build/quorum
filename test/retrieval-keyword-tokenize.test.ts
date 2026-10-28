import { describe, expect, it } from "vitest";
import { buildFtsMatchQuery } from "../src/domain/retrieval/keyword-search.js";
import { tokenizeQueryForFts } from "../src/domain/retrieval/query-tokenize.js";

describe("Unicode FTS tokenization", () => {
  it("keeps letters with accents as whole tokens", () => {
    expect(tokenizeQueryForFts("héllo wörld")).toEqual(["héllo", "wörld"]);
    const match = buildFtsMatchQuery("héllo wörld");
    expect(match).toContain('"héllo"');
    expect(match).toContain('"wörld"');
    expect(match).not.toContain('"llo"');
  });
});
