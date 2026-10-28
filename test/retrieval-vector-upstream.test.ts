import { describe, expect, it, vi } from "vitest";
import { RetrievalUpstreamError } from "../src/domain/retrieval/errors.js";
import { searchChunksByVector } from "../src/domain/retrieval/vector-search.js";

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
});
