import { describe, expect, it } from "vitest";
import {
  CHUNK_VECTOR_ID_FORMAT,
  CHUNK_VECTOR_ID_MAX_BYTES,
  chunkVectorId,
  chunkVectorIdInput,
} from "../src/domain/ingestion/vector-id.js";

const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

describe("chunkVectorId", () => {
  it("is always 64 lowercase hex bytes for long Linear and GitHub ids", async () => {
    const linearIssueId = "a".repeat(36);
    const longPath = `${"b".repeat(120)}/deep/nested/readme.md`;

    for (const documentId of [linearIssueId, longPath, "README.md"]) {
      const id = await chunkVectorId(SOURCE_ID, documentId, 0);
      expect(id.length).toBe(CHUNK_VECTOR_ID_MAX_BYTES);
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pins deterministic sha256-hex-namespaced-key format", async () => {
    const input = chunkVectorIdInput(SOURCE_ID, "doc.md", 0);
    expect(input).toBe(`${SOURCE_ID}:doc.md:0`);
    const id = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    expect(CHUNK_VECTOR_ID_FORMAT).toBe("sha256-hex-namespaced-key");
    const again = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    expect(id).toBe(again);
    const other = await chunkVectorId(SOURCE_ID, "doc.md", 1);
    expect(other).not.toBe(id);
  });
});
