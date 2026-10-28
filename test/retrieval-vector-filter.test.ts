import { describe, expect, it } from "vitest";
import {
  chunkSourceIdsForVectorizeFilter,
  vectorizeFilterJsonByteLength,
  VECTORIZE_FILTER_MAX_BYTES,
} from "../src/domain/retrieval/vector-search.js";

function uuidForIndex(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

describe("chunkSourceIdsForVectorizeFilter", () => {
  it("splits 60+ source ids so each filter stays strictly under 2048 UTF-8 bytes", () => {
    const sourceIds = Array.from({ length: 65 }, (_, index) => uuidForIndex(index + 1));
    const groups = chunkSourceIdsForVectorizeFilter(sourceIds);

    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      expect(vectorizeFilterJsonByteLength(group)).toBeLessThan(
        VECTORIZE_FILTER_MAX_BYTES,
      );
    }
    expect(groups.flat()).toEqual(sourceIds);
  });

  it("rejects filters at or over 2048 UTF-8 bytes when sizing groups", () => {
    const ids: string[] = [];
    while (vectorizeFilterJsonByteLength(ids) < VECTORIZE_FILTER_MAX_BYTES) {
      ids.push(uuidForIndex(ids.length + 1));
    }
    const overflow = [...ids, uuidForIndex(ids.length + 500)];
    expect(vectorizeFilterJsonByteLength(overflow)).toBeGreaterThanOrEqual(
      VECTORIZE_FILTER_MAX_BYTES,
    );

    const groups = chunkSourceIdsForVectorizeFilter(overflow);
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      expect(vectorizeFilterJsonByteLength(group)).toBeLessThan(
        VECTORIZE_FILTER_MAX_BYTES,
      );
    }
    expect(groups.flat()).toEqual(overflow);
  });

  it("accepts a filter strictly under 2048 UTF-8 bytes even when JSON char length is smaller than byte length", () => {
    const multibyteId = `00000000-0000-4000-8000-${"é".repeat(400)}`;
    const byteLength = vectorizeFilterJsonByteLength([multibyteId]);
    expect(multibyteId.length).toBeLessThan(VECTORIZE_FILTER_MAX_BYTES);
    expect(byteLength).toBeGreaterThan(multibyteId.length);
    expect(byteLength).toBeLessThan(VECTORIZE_FILTER_MAX_BYTES);
  });

  it("starts a new group before byte length reaches 2048 when adding another multibyte id would cross the limit", () => {
    const idA = `00000000-0000-4000-8000-${"é".repeat(500)}`;
    const idB = `00000000-0000-4000-8000-${"é".repeat(500)}`;
    expect(vectorizeFilterJsonByteLength([idA])).toBeLessThan(
      VECTORIZE_FILTER_MAX_BYTES,
    );
    expect(vectorizeFilterJsonByteLength([idA, idB])).toBeGreaterThanOrEqual(
      VECTORIZE_FILTER_MAX_BYTES,
    );

    const groups = chunkSourceIdsForVectorizeFilter([idA, idB]);
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(vectorizeFilterJsonByteLength(group)).toBeLessThan(
        VECTORIZE_FILTER_MAX_BYTES,
      );
    }
  });
});
