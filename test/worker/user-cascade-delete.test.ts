import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteChunkVectors } from "../../src/domain/ingestion/delete-vectors.js";
import { chunkVectorId } from "../../src/domain/ingestion/vector-id.js";
import { deleteUserAccount } from "../../src/domain/users/delete-account.js";

const USER_ID = "00000000-0000-4000-8000-000000000050";
const SESSION_ID = "00000000-0000-4000-8000-000000000051";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000052";
const SOURCE_ID = "00000000-0000-4000-8000-000000000053";
const SOURCE_ID_B = "00000000-0000-4000-8000-000000000058";
const OWNERLESS_SOURCE_ID = "00000000-0000-4000-8000-000000000059";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000060";
const OTHER_CONNECTION_ID = "00000000-0000-4000-8000-000000000061";
const OTHER_SOURCE_ID = "00000000-0000-4000-8000-000000000062";
const CHAT_ID = "00000000-0000-4000-8000-000000000054";
const CHAT_SESSION_ID = "00000000-0000-4000-8000-000000000055";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000056";
const API_KEY_ID = "00000000-0000-4000-8000-000000000057";

describe("user delete cascade (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM write_back_proposals").run();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM chunks").run();
    await env.DB.prepare("DELETE FROM knowledge_sources").run();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM api_keys").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("removes owned rows without orphans when a user is deleted", async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login) VALUES (?, 50, 'cascade-user')`,
    )
      .bind(USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES (?, ?, 'hash', '2099-01-01T00:00:00.000Z')`,
    )
      .bind(SESSION_ID, USER_ID)
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
        ) VALUES (?, 'doc.md', 0, 'chunk', '[]')`,
    )
      .bind(SOURCE_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO chat_messages (
          id, session_id, user_id, role, content, citations
        ) VALUES (?, ?, ?, 'user', 'hello', '[]')`,
    )
      .bind(CHAT_ID, CHAT_SESSION_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO write_back_proposals (
          id, chat_message_id, user_id, plan, feedback_history, execution_results
        ) VALUES (?, ?, ?, '{}', '[]', '[]')`,
    )
      .bind(PROPOSAL_ID, CHAT_ID, USER_ID)
      .run();

    await env.DB.prepare(
      `INSERT INTO api_keys (id, key_hash, user_id) VALUES (?, 'keyhash', ?)`,
    )
      .bind(API_KEY_ID, USER_ID)
      .run();

    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(USER_ID).run();

    const counts = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM connections WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM knowledge_sources WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`)
        .bind(SOURCE_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM write_back_proposals WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ?`)
        .bind(USER_ID)
        .first<{ c: number }>(),
    ]);

    for (const row of counts) {
      expect(row?.c).toBe(0);
    }
  });
});

async function seedUserWithIndexedSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 50, 'vector-user')`,
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
      ) VALUES (?, 'doc.md', 0, 'chunk', '[]')`,
  )
    .bind(SOURCE_ID)
    .run();
}

async function seedOtherUserWithIndexedSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 60, 'other-vector-user')`,
  )
    .bind(OTHER_USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'other-acct', 'Other')`,
  )
    .bind(OTHER_CONNECTION_ID, OTHER_USER_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'other/org', ?, 'Other repo', 'ready')`,
  )
    .bind(OTHER_SOURCE_ID, OTHER_USER_ID, OTHER_CONNECTION_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'other-doc.md', 0, 'other chunk', '[]')`,
  )
    .bind(OTHER_SOURCE_ID)
    .run();
}

async function seedUserWithTwoIndexedSources(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 50, 'multi-source-user')`,
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
      ) VALUES (?, ?, 'github_repo', 'org/repo-a', ?, 'Repo A', 'ready')`,
  )
    .bind(SOURCE_ID, USER_ID, CONNECTION_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/repo-b', ?, 'Repo B', 'ready')`,
  )
    .bind(SOURCE_ID_B, USER_ID, CONNECTION_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'doc-a.md', 0, 'chunk a', '[]')`,
  )
    .bind(SOURCE_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'doc-b.md', 0, 'chunk b', '[]')`,
  )
    .bind(SOURCE_ID_B)
    .run();
}

async function seedUserWithOwnerlessConnectionSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 50, 'ownerless-source-user')`,
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
      ) VALUES (?, NULL, 'github_repo', 'org/shared', ?, 'Shared', 'ready')`,
  )
    .bind(OWNERLESS_SOURCE_ID, CONNECTION_ID)
    .run();

  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'shared.md', 0, 'shared chunk', '[]')`,
  )
    .bind(OWNERLESS_SOURCE_ID)
    .run();
}

describe("deleteUserAccount (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM write_back_proposals").run();
    await env.DB.prepare("DELETE FROM chat_messages").run();
    await env.DB.prepare("DELETE FROM chunks").run();
    await env.DB.prepare("DELETE FROM knowledge_sources").run();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM sessions").run();
    await env.DB.prepare("DELETE FROM api_keys").run();
    await env.DB.prepare("DELETE FROM users").run();
  });

  it("calls deleteByIds for chunk vectors then removes the user and owned D1 rows", async () => {
    await seedUserWithIndexedSource();
    const expectedVectorId = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteUserAccount(env.DB, vectorize, USER_ID);

    expect(deletedVectorIds).toEqual([expectedVectorId]);
    expect(vectorize.deleteByIds).toHaveBeenCalledOnce();

    const userRow = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(USER_ID)
      .first();
    expect(userRow).toBeNull();

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).toBeNull();
  });

  it("deletes vectors before D1 rows and leaves the user row when vector delete fails", async () => {
    await seedUserWithIndexedSource();
    let userExistedDuringVectors = false;

    const trackVectors: DeleteChunkVectors = async () => {
      const userRow = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
        .bind(USER_ID)
        .first();
      userExistedDuringVectors = userRow !== null;

      const sourceRow = await env.DB.prepare(
        `SELECT id FROM knowledge_sources WHERE id = ?`,
      )
        .bind(SOURCE_ID)
        .first();
      expect(sourceRow).not.toBeNull();
    };

    await deleteUserAccount(env.DB, env.VECTORIZE, USER_ID, {
      deleteChunkVectors: trackVectors,
    });

    expect(userExistedDuringVectors).toBe(true);

    const failVectors: DeleteChunkVectors = async () => {
      throw new Error("vector delete failed");
    };

    await seedUserWithIndexedSource();

    await expect(
      deleteUserAccount(env.DB, env.VECTORIZE, USER_ID, {
        deleteChunkVectors: failVectors,
      }),
    ).rejects.toThrow(/vector delete failed/);

    const userAfterFailure = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(USER_ID)
      .first();
    expect(userAfterFailure).not.toBeNull();

    const sourceAfterFailure = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceAfterFailure).not.toBeNull();
  });

  it("does not delete another user's vectors or D1 rows", async () => {
    await seedUserWithIndexedSource();
    await seedOtherUserWithIndexedSource();

    const targetVectorId = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    const otherVectorId = await chunkVectorId(OTHER_SOURCE_ID, "other-doc.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteUserAccount(env.DB, vectorize, USER_ID);

    expect(deletedVectorIds).toEqual([targetVectorId]);
    expect(deletedVectorIds).not.toContain(otherVectorId);

    const otherUser = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(OTHER_USER_ID)
      .first();
    expect(otherUser).not.toBeNull();

    const otherSource = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OTHER_SOURCE_ID)
      .first();
    expect(otherSource).not.toBeNull();

    const otherChunk = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(OTHER_SOURCE_ID)
      .first();
    expect(otherChunk).not.toBeNull();
  });

  it("deleteByIds receives vector ids for every knowledge source on the account", async () => {
    await seedUserWithTwoIndexedSources();

    const vectorIdA = await chunkVectorId(SOURCE_ID, "doc-a.md", 0);
    const vectorIdB = await chunkVectorId(SOURCE_ID_B, "doc-b.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteUserAccount(env.DB, vectorize, USER_ID);

    expect(deletedVectorIds.sort()).toEqual([vectorIdA, vectorIdB].sort());
  });

  it("deletes vectors for connection-scoped sources when user_id is null", async () => {
    await seedUserWithOwnerlessConnectionSource();

    const ownerlessVectorId = await chunkVectorId(OWNERLESS_SOURCE_ID, "shared.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteUserAccount(env.DB, vectorize, USER_ID);

    expect(deletedVectorIds).toEqual([ownerlessVectorId]);

    const ownerlessSource = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNERLESS_SOURCE_ID)
      .first();
    expect(ownerlessSource).toBeNull();
  });
});
