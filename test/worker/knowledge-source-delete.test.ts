import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteChunkVectors } from "../../src/domain/ingestion/delete-vectors.js";
import { chunkVectorId } from "../../src/domain/ingestion/vector-id.js";
import { deleteKnowledgeSource } from "../../src/domain/knowledge-sources/delete.js";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const WRONG_OWNER_ID = "00000000-0000-4000-8000-000000000011";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const SOURCE_ID = "00000000-0000-4000-8000-000000000030";

async function seedKnowledgeSourceWithChunk(): Promise<number> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'qa-user')`,
  )
    .bind(USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready')`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'doc.md', 0, 'hello quorum', '[]')`,
  )
    .bind(SOURCE_ID)
    .run();

  const chunk = await env.DB.prepare(
    `SELECT id FROM chunks WHERE knowledge_source_id = ?`,
  )
    .bind(SOURCE_ID)
    .first<{ id: number }>();
  if (!chunk) {
    throw new Error("expected chunk row");
  }
  return chunk.id;
}

async function clearUserScopedData(): Promise<void> {
  await env.DB.prepare("DELETE FROM write_back_proposals").run();
  await env.DB.prepare("DELETE FROM chat_messages").run();
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM sessions").run();
  await env.DB.prepare("DELETE FROM api_keys").run();
  await env.DB.prepare("DELETE FROM users").run();
}

describe("deleteKnowledgeSource (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearUserScopedData();
  });

  it("removes chunks and FTS rows when the knowledge source is deleted", async () => {
    const chunkId = await seedKnowledgeSourceWithChunk();

    const ftsBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM chunks c
       INNER JOIN chunks_fts f ON c.id = f.rowid
       WHERE c.id = ?`,
    )
      .bind(chunkId)
      .first<{ count: number }>();
    expect(ftsBefore?.count).toBe(1);

    const deleted = await deleteKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      SOURCE_ID,
      USER_ID,
      {
        deleteChunkVectors: async () => {},
      },
    );
    expect(deleted).toBe(true);

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).toBeNull();

    const chunkRow = await env.DB.prepare(`SELECT id FROM chunks WHERE id = ?`)
      .bind(chunkId)
      .first();
    expect(chunkRow).toBeNull();

    const ftsAfter = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM chunks c
       INNER JOIN chunks_fts f ON c.id = f.rowid
       WHERE c.id = ?`,
    )
      .bind(chunkId)
      .first<{ count: number }>();
    expect(ftsAfter?.count).toBe(0);
  });

  it("passes namespaced vector ids to the vector helper before the D1 delete", async () => {
    await seedKnowledgeSourceWithChunk();
    const vectorId = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    let vectorChunkIds: string[] | undefined;
    let sourceExistedDuringVectors = false;

    const trackVectors: DeleteChunkVectors = async (_vectorize, chunkIds) => {
      vectorChunkIds = chunkIds;
      const row = await env.DB.prepare(`SELECT id FROM knowledge_sources WHERE id = ?`)
        .bind(SOURCE_ID)
        .first();
      sourceExistedDuringVectors = row !== null;
    };

    const deleted = await deleteKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      SOURCE_ID,
      USER_ID,
      {
        deleteChunkVectors: trackVectors,
      },
    );
    expect(deleted).toBe(true);

    expect(vectorChunkIds).toEqual([vectorId]);
    expect(sourceExistedDuringVectors).toBe(true);
  });

  it("leaves D1 rows in place when the vector helper throws", async () => {
    const chunkId = await seedKnowledgeSourceWithChunk();

    const failVectors: DeleteChunkVectors = async () => {
      throw new Error("vector delete failed");
    };

    await expect(
      deleteKnowledgeSource(env.DB, env.VECTORIZE, SOURCE_ID, USER_ID, {
        deleteChunkVectors: failVectors,
      }),
    ).rejects.toThrow(/vector delete failed/);

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).not.toBeNull();

    const chunkRow = await env.DB.prepare(`SELECT id FROM chunks WHERE id = ?`)
      .bind(chunkId)
      .first();
    expect(chunkRow).not.toBeNull();
  });

  it("returns false when owner user_id does not match without deleting rows", async () => {
    const chunkId = await seedKnowledgeSourceWithChunk();
    const deleteChunkVectors = vi.fn();

    const deleted = await deleteKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      SOURCE_ID,
      WRONG_OWNER_ID,
      { deleteChunkVectors },
    );
    expect(deleted).toBe(false);
    expect(deleteChunkVectors).not.toHaveBeenCalled();

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).not.toBeNull();

    const chunkRow = await env.DB.prepare(`SELECT id FROM chunks WHERE id = ?`)
      .bind(chunkId)
      .first();
    expect(chunkRow).not.toBeNull();
  });

  it("returns false when deleting twice or when the source id is missing", async () => {
    await seedKnowledgeSourceWithChunk();

    expect(
      await deleteKnowledgeSource(env.DB, env.VECTORIZE, SOURCE_ID, USER_ID, {
        deleteChunkVectors: async () => {},
      }),
    ).toBe(true);
    expect(
      await deleteKnowledgeSource(env.DB, env.VECTORIZE, SOURCE_ID, USER_ID, {
        deleteChunkVectors: async () => {},
      }),
    ).toBe(false);

    expect(
      await deleteKnowledgeSource(
        env.DB,
        env.VECTORIZE,
        "00000000-0000-4000-8000-000000009999",
        USER_ID,
        { deleteChunkVectors: async () => {} },
      ),
    ).toBe(false);
  });
});
