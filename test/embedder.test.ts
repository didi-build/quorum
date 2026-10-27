import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import {
  contextualizedEmbeddingsUrl,
  EMBEDDING_BATCH_SIZE,
  embedChunksFlat,
  embedDocumentChunkGroups,
} from "../src/domain/ingestion/embedder.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const config = loadConfig(withTestConfigEnv());

describe("embedder", () => {
  it("calls contextualized embeddings with document input_type", async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({
          data: [
            {
              index: 0,
              data: [{ index: 0, embedding: [0.1, 0.2] }],
            },
          ],
          model: config.voyageModel,
        }),
        { status: 200 },
      );
    });

    await embedDocumentChunkGroups(config, [["hello"]], fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      contextualizedEmbeddingsUrl(config),
      expect.objectContaining({ method: "POST" }),
    );
    const payload = JSON.parse(bodies[0]) as { input_type: string; model: string };
    expect(payload.input_type).toBe("document");
    expect(payload.model).toBe(config.voyageModel);
  });

  it("batches flat chunks in groups of EMBEDDING_BATCH_SIZE", async () => {
    const callChunkCounts: number[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        inputs: string[][];
      };
      const count = payload.inputs.reduce((sum, group) => sum + group.length, 0);
      callChunkCounts.push(count);
      const data = payload.inputs.map((group, docIndex) => ({
        index: docIndex,
        data: group.map((_, chunkIndex) => ({
          index: chunkIndex,
          embedding: [0.1],
        })),
      }));
      return new Response(JSON.stringify({ data, model: config.voyageModel }), {
        status: 200,
      });
    });

    const chunks = Array.from({ length: EMBEDDING_BATCH_SIZE + 5 }, (_, i) => ({
      document_id: "doc.md",
      chunk_index: i,
      content: `chunk-${i}`,
    }));

    await embedChunksFlat(config, chunks, fetchImpl);

    expect(callChunkCounts).toEqual([EMBEDDING_BATCH_SIZE, 5]);
  });
});
