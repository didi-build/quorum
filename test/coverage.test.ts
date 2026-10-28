import { describe, expect, it } from "vitest";
import { coverageCheck } from "../src/domain/retrieval/coverage.js";

describe("coverageCheck (v1 parity)", () => {
  it("is sufficient when terms are present", () => {
    const result = coverageCheck(
      "permissions model access control",
      ["The permissions model uses can_access for authorization."],
      0.3,
    );
    expect(result.sufficient).toBe(true);
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("is insufficient when terms are missing", () => {
    const result = coverageCheck(
      "kubernetes deployment terraform",
      ["Simple chunking strategy for markdown documents."],
      0.5,
    );
    expect(result.sufficient).toBe(false);
  });
});
