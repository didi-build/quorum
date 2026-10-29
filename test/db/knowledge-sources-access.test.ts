import { describe, expect, it } from "vitest";
import { KNOWLEDGE_SOURCE_ACCESS_SQL } from "../../src/domain/db/knowledge-sources.js";

describe("KNOWLEDGE_SOURCE_ACCESS_SQL (unit)", () => {
  it("matches can_access semantics used by retrieval source scope", () => {
    expect(KNOWLEDGE_SOURCE_ACCESS_SQL).toContain(
      "user_id IS NULL AND project_id IS NULL",
    );
    expect(KNOWLEDGE_SOURCE_ACCESS_SQL).toContain(
      "user_id = ?1 AND project_id IS NULL",
    );
    expect(KNOWLEDGE_SOURCE_ACCESS_SQL).toContain(
      "user_id IS NULL AND project_id = ?2",
    );
    expect(KNOWLEDGE_SOURCE_ACCESS_SQL).toContain("user_id = ?1 AND project_id = ?2");
  });
});
