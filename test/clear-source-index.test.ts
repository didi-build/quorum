import { describe, expect, it, vi } from "vitest";
import { clearSourceIndex } from "../src/domain/ingestion/clear-source-index.js";

describe("clearSourceIndex", () => {
  it("deletes vectors before D1 chunk rows", async () => {
    const order: string[] = [];

    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            if (sql.includes("SELECT")) {
              return { results: [{ document_id: "doc.md", chunk_index: 0 }] };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => {
            if (sql.includes("DELETE FROM chunks")) {
              order.push("d1");
            }
          }),
        })),
      })),
    } as unknown as D1Database;

    await clearSourceIndex(db, {} as VectorizeIndex, "source-id", {
      deleteChunkVectors: async () => {
        order.push("vectors");
      },
    });

    expect(order).toEqual(["vectors", "d1"]);
  });
});
