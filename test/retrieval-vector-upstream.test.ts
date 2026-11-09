import { describe, expect, it, vi } from "vitest";
import { RetrievalUpstreamError } from "../src/domain/retrieval/errors.js";
import { searchChunksByVector } from "../src/domain/retrieval/vector-search.js";
import { workerErrorResponse } from "../src/http/api-error.js";

const SOURCE = "00000000-0000-4000-8000-000000000030";

describe("searchChunksByVector upstream errors", () => {
  it("throws RetrievalUpstreamError with status 503 when Vectorize query fails", async () => {
    const vectorize = {
      query: vi.fn(async () => {
        throw new Error("vectorize unavailable");
      }),
    } as unknown as VectorizeIndex;

    const db = {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }) }),
      }),
    } as unknown as D1Database;

    await expect(
      searchChunksByVector(vectorize, db, [SOURCE], [0.1, 0.2], 5),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof RetrievalUpstreamError && error.statusCode === 503;
    });
  });

  it("propagates D1 load errors without mapping them to Vectorize 503", async () => {
    const d1Error = new Error("d1 unavailable");
    const vectorize = {
      query: vi.fn(async () => ({
        matches: [
          {
            id: "vec-1",
            score: 0.9,
            metadata: { chunk_rowid: 7, knowledge_source_id: SOURCE },
          },
        ],
      })),
    } as unknown as VectorizeIndex;

    const db = {
      prepare: () => ({
        bind: () => ({
          all: vi.fn(async () => {
            throw d1Error;
          }),
        }),
      }),
    } as unknown as D1Database;

    await expect(
      searchChunksByVector(vectorize, db, [SOURCE], [0.1, 0.2], 5),
    ).rejects.toBe(d1Error);
    expect(workerErrorResponse(d1Error).status).toBe(500);
  });
});
