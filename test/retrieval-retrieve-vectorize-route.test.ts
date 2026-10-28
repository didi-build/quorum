import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config/load-config.js";
import type { ChunkRow } from "../src/domain/retrieval/chunk-rows.js";
import * as keywordSearch from "../src/domain/retrieval/keyword-search.js";
import { actorContext } from "../src/domain/schemas/actor.js";
import { handleRetrievalRoute } from "../src/routes/retrieval.js";
import { withTestConfigEnv } from "./fixtures/config-env.js";

const USER = "00000000-0000-4000-8000-000000000010";
const PROJECT = "10000000-0000-4000-8000-000000000001";
const SOURCE = "00000000-0000-4000-8000-000000000030";

const keywordRow: ChunkRow = {
  id: 42,
  knowledge_source_id: SOURCE,
  document_id: "doc.md",
  chunk_index: 0,
  content: "permissions model access control keyword hit",
  heading_hierarchy: [],
};

describe("handleRetrievalRoute with real retrieve when Vectorize fails", () => {
  it("returns 503 instead of keyword-only 200 when Vectorize query throws", async () => {
    const config = loadConfig(withTestConfigEnv({}));
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [{ id: SOURCE }] }),
        }),
      }),
    } as unknown as D1Database;

    vi.spyOn(keywordSearch, "searchChunksByKeyword").mockResolvedValue([keywordRow]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              index: 0,
              data: [
                {
                  index: 0,
                  embedding: Array.from(
                    { length: config.embeddingDimensions },
                    () => 0.02,
                  ),
                },
              ],
            },
          ],
          model: config.voyageModel,
        }),
      ),
    );

    const response = await handleRetrievalRoute(
      new Request("http://example.com/retrieval/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "permissions model access control" }),
      }),
      {
        DB: db,
        VECTORIZE: {
          query: vi.fn(async () => {
            throw new Error("vectorize unavailable");
          }),
        } as unknown as VectorizeIndex,
      } as import("../src/env.js").Env,
      config,
      "/retrieval/query",
      actorContext(USER, PROJECT),
    );

    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    expect(response?.status).toBe(503);
    const body = (await response!.json()) as { detail: string };
    expect(body.detail).toBe("Retrieval upstream unavailable");
  });
});
