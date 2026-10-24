import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { deleteKnowledgeSource } from "../../src/domain/knowledge-sources/delete.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";
const CHUNK_ID = "00000000-0000-4000-8000-000000000040";

describe("deleteKnowledgeSource (integration, vitest-pool-workers)", () => {
  it("removes chunks and FTS rows when the knowledge source is deleted", async () => {
    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
    )
      .bind(CONNECTION_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, 'github_repo', 'org/repo', ?, 'Repo', 'ready')`,
    )
      .bind(SOURCE_ID, CONNECTION_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO chunks (
        id, knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, ?, 'doc.md', 0, 'hello quorum', '[]')`,
    )
      .bind(CHUNK_ID, SOURCE_ID)
      .run();

    const ftsBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM chunks c
       INNER JOIN chunks_fts f ON c.rowid = f.rowid
       WHERE c.id = ?`,
    )
      .bind(CHUNK_ID)
      .first<{ count: number }>();
    expect(ftsBefore?.count).toBe(1);

    await deleteKnowledgeSource(env.DB, env.VECTORIZE, SOURCE_ID);

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).toBeNull();

    const chunkRow = await env.DB.prepare(`SELECT id FROM chunks WHERE id = ?`)
      .bind(CHUNK_ID)
      .first();
    expect(chunkRow).toBeNull();

    const ftsAfter = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM chunks c
       INNER JOIN chunks_fts f ON c.rowid = f.rowid
       WHERE c.id = ?`,
    )
      .bind(CHUNK_ID)
      .first<{ count: number }>();
    expect(ftsAfter?.count).toBe(0);
  });
});
