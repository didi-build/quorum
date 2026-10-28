import { describe, expect, it } from "vitest";
import { coverageCheck } from "../src/domain/retrieval/coverage.js";

describe("coverageCheck edge cases (beyond v1 parity tests)", () => {
  it("lowercases query terms for matching", () => {
    const result = coverageCheck("PERMISSIONS", ["permissions model"], 0.3);
    expect(result.sufficient).toBe(true);
  });

  it("ignores tokens of length 1 or 2", () => {
    const result = coverageCheck("ab permissions cd", ["permissions model here"], 0.5);
    expect(result.sufficient).toBe(true);
    expect(result.score).toBe(1);
  });

  it("treats score equal to min_score as sufficient", () => {
    const minScore = 2 / 3;
    const result = coverageCheck("alpha beta gamma", ["alpha beta only"], minScore);
    expect(result.score).toBeCloseTo(minScore, 5);
    expect(result.sufficient).toBe(true);
  });

  it("uses a custom min_score threshold", () => {
    const result = coverageCheck("alpha beta gamma", ["alpha beta only"], 0.9);
    expect(result.sufficient).toBe(false);
  });

  it("treats an empty query as sufficient", () => {
    const result = coverageCheck("   ", ["anything"], 0.99);
    expect(result).toEqual({ sufficient: true, score: 1 });
  });
});
