import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../src/domain/retrieval/rrf.js";

describe("reciprocalRankFusion exact scores", () => {
  it("assigns rank 1 at k=60 with score 1/(60+1)", () => {
    const merged = reciprocalRankFusion([[{ chunkId: 7, rank: 1 }]], 60);
    expect(merged[0]?.[1]).toBeCloseTo(1 / 61, 10);
    expect(merged[0]?.[2].vector_rank).toBe(1);
    expect(merged[0]?.[2].keyword_rank).toBeNull();
  });

  it("sums duplicate ranks from the same list", () => {
    const merged = reciprocalRankFusion(
      [
        [
          { chunkId: 1, rank: 1 },
          { chunkId: 1, rank: 2 },
        ],
      ],
      60,
    );
    expect(merged[0]?.[1]).toBeCloseTo(1 / 61 + 1 / 62, 10);
  });

  it("preserves ordering when scores differ", () => {
    const high = "00000000-0000-4000-8000-000000000010";
    const low = "00000000-0000-4000-8000-000000000011";
    const merged = reciprocalRankFusion(
      [[{ chunkId: high, rank: 1 }], [{ chunkId: low, rank: 2 }]],
      60,
    );
    expect(merged[0]?.[0]).toBe(high);
    expect(merged[1]?.[0]).toBe(low);
  });

  it("stores vector and keyword ranks separately", () => {
    const id = 5;
    const merged = reciprocalRankFusion(
      [[{ chunkId: id, rank: 2 }], [{ chunkId: id, rank: 1 }]],
      60,
    );
    expect(merged[0]?.[2]).toEqual({ vector_rank: 2, keyword_rank: 1 });
  });
});
