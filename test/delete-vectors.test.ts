import { describe, expect, it, vi } from "vitest";
import {
  CHUNK_VECTOR_DELETE_BATCH_SIZE,
  deleteChunkVectors,
} from "../src/domain/ingestion/delete-vectors.js";
import { chunkVectorId } from "../src/domain/ingestion/vector-id.js";

describe("deleteChunkVectors", () => {
  it("calls deleteByIds in batches of 100", async () => {
    const batchSizes: number[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        batchSizes.push(ids.length);
      }),
    } as unknown as VectorizeIndex;

    const sourceId = "00000000-0000-4000-8000-000000000099";
    const ids: string[] = [];
    for (let i = 0; i < 150; i++) {
      ids.push(await chunkVectorId(sourceId, `doc-${i}.md`, 0));
    }

    await deleteChunkVectors(vectorize, ids);

    expect(batchSizes).toEqual([100, 50]);
    expect(vectorize.deleteByIds).toHaveBeenCalledTimes(2);
    expect(CHUNK_VECTOR_DELETE_BATCH_SIZE).toBe(100);
  });

  it("invokes deleteByIds for every id when vectors are present", async () => {
    const deleted: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deleted.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    const sourceId = "00000000-0000-4000-8000-000000000088";
    const id = await chunkVectorId(sourceId, "README.md", 0);
    await deleteChunkVectors(vectorize, [id]);

    expect(deleted).toEqual([id]);
    expect(vectorize.deleteByIds).toHaveBeenCalledOnce();
  });
});
