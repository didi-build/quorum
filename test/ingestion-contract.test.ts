import { describe, expect, it } from "vitest";
import { chunkText } from "../src/domain/ingestion/chunking.js";
import { upsertVectors } from "../src/domain/ingestion/pipeline.js";
import {
  CHUNK_VECTOR_ID_FORMAT,
  chunkVectorId,
} from "../src/domain/ingestion/vector-id.js";

describe("ingestion contracts", () => {
  it("honors chunk target and overlap settings", () => {
    const prose = `${"word ".repeat(300)}\n\n`.repeat(10);
    const smallChunks = chunkText("doc.md", prose, {
      chunkTargetTokens: 64,
      chunkOverlapTokens: 8,
    });
    const largeChunks = chunkText("doc.md", prose, {
      chunkTargetTokens: 512,
      chunkOverlapTokens: 8,
    });
    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    expect(smallChunks.length).toBeGreaterThan(3);
  });

  it("includes required vector metadata and hashed id format", async () => {
    const upserted: Array<{
      id: string;
      metadata: Record<string, unknown>;
    }> = [];
    const vectorize = {
      upsert: async (
        rows: Array<{ id: string; metadata: Record<string, unknown> }>,
      ) => {
        upserted.push(...rows);
      },
    } as unknown as VectorizeIndex;

    const sourceId = "00000000-0000-4000-8000-000000000030";
    await upsertVectors(vectorize, sourceId, [
      {
        chunk_rowid: 42,
        document_id: "README.md",
        chunk_index: 0,
        embedding: [0.1, 0.2],
      },
    ]);

    expect(upserted).toHaveLength(1);
    expect(upserted[0].metadata).toEqual({
      knowledge_source_id: sourceId,
      document_id: "README.md",
      chunk_index: 0,
      chunk_rowid: 42,
    });
    expect(CHUNK_VECTOR_ID_FORMAT).toBe("sha256-hex-namespaced-key");
    expect(upserted[0].id).toBe(await chunkVectorId(sourceId, "README.md", 0));
  });
});
