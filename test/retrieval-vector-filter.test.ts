import { describe, expect, it } from "vitest";
import {
  chunkSourceIdsForVectorizeFilter,
  VECTORIZE_FILTER_MAX_BYTES,
} from "../src/domain/retrieval/vector-search.js";

function uuidForIndex(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("chunkSourceIdsForVectorizeFilter", () => {
  it("splits 60+ source ids so each filter JSON stays under 2048 bytes", () => {
    const sourceIds = Array.from({ length: 65 }, (_, index) => uuidForIndex(index + 1));
    const groups = chunkSourceIdsForVectorizeFilter(sourceIds);

    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      const filter = { knowledge_source_id: { $in: group } };
      expect(JSON.stringify(filter).length).toBeLessThanOrEqual(
        VECTORIZE_FILTER_MAX_BYTES,
      );
    }
    expect(groups.flat()).toEqual(sourceIds);
  });
});
