import { describe, expect, it } from "vitest";
import { buildFtsMatchQuery } from "../src/domain/retrieval/keyword-search.js";
import { RETRIEVAL_FTS_MAX_TERMS } from "../src/domain/retrieval/query-limits.js";
import { tokenizeQueryForFts } from "../src/domain/retrieval/query-tokenize.js";

describe("keyword search hardening", () => {
  it("caps FTS MATCH at 32 AND terms", () => {
    const terms = Array.from({ length: 40 }, (_, index) => `keyword${index}`);
    const query = terms.join(" ");
    const match = buildFtsMatchQuery(query);
    expect(match).not.toBeNull();
    const parts = match!.split(" AND ");
    expect(parts).toHaveLength(RETRIEVAL_FTS_MAX_TERMS);
    expect(tokenizeQueryForFts(query).length).toBeGreaterThan(RETRIEVAL_FTS_MAX_TERMS);
  });

  it("does not emit OR 1=1 style injection in MATCH", () => {
    const match = buildFtsMatchQuery('alpha") OR 1=1 -- beta gamma');
    expect(match).not.toBeNull();
    expect(match).not.toMatch(/\bOR\b/i);
    expect(match).not.toContain("1=1");
    expect(match).toContain('"alpha"');
  });
});
