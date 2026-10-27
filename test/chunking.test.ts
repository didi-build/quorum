import { describe, expect, it } from "vitest";
import { chunkText } from "../src/domain/ingestion/chunking.js";

const chunkConfig = { chunkTargetTokens: 512, chunkOverlapTokens: 50 };

describe("chunkText", () => {
  it("splits markdown sections", () => {
    const text =
      "# Title\n\nFirst paragraph.\n\n## Section\n\nSecond paragraph with details.";
    const chunks = chunkText("docs/readme.md", text, chunkConfig);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].document_id).toBe("docs/readme.md");
    const combined = chunks.map((c) => c.content).join(" ");
    expect(combined).toMatch(/First paragraph/);
    expect(combined).toMatch(/Second paragraph/);
  });
});
