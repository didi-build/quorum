import { describe, expect, it } from "vitest";
import {
  reciprocalRankFusion,
  type RankedResult,
} from "../src/domain/retrieval/rrf.js";

describe("reciprocalRankFusion (v1 parity)", () => {
  it("merges ranked lists", () => {
    const chunkA = "00000000-0000-4000-8000-000000000010";
    const chunkB = "00000000-0000-4000-8000-000000000011";
    const chunkC = "00000000-0000-4000-8000-000000000012";

    const vector: RankedResult[] = [
      { chunkId: chunkA, rank: 1 },
      { chunkId: chunkB, rank: 2 },
    ];
    const keyword: RankedResult[] = [
      { chunkId: chunkB, rank: 1 },
      { chunkId: chunkC, rank: 2 },
    ];

    const merged = reciprocalRankFusion([vector, keyword], 60);
    const ids = merged.map((item) => item[0]);

    expect(ids[0]).toBe(chunkB);
    expect(new Set(ids)).toEqual(new Set([chunkA, chunkB, chunkC]));
  });
});
