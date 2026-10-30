import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteChunkVectors } from "../../src/domain/ingestion/delete-vectors.js";
import { chunkVectorId } from "../../src/domain/ingestion/vector-id.js";
import { deleteConnection } from "../../src/domain/connections/delete-connection.js";

const USER_ID = "00000000-0000-4000-8000-000000000070";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000071";
const SOURCE_ID = "00000000-0000-4000-8000-000000000072";
const SOURCE_ID_B = "00000000-0000-4000-8000-000000000073";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000074";
const OTHER_CONNECTION_ID = "00000000-0000-4000-8000-000000000075";
const OTHER_SOURCE_ID = "00000000-0000-4000-8000-000000000076";

async function seedConnectionWithIndexedSource(options?: {
  skipUser?: boolean;
}): Promise<void> {
  if (!options?.skipUser) {
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login) VALUES (?, 70, 'conn-delete-user')`,
    )
      .bind(USER_ID)
      .run();
  }

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

async function seedOtherConnectionWithIndexedSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 74, 'other-conn-user')`,
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

async function seedConnectionWithTwoIndexedSources(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 70, 'multi-source-conn')`,
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

describe("deleteConnection (integration, vitest-pool-workers)", () => {
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

  it("calls deleteByIds for chunk vectors then removes the connection and owned D1 rows", async () => {
    await seedConnectionWithIndexedSource();
    const expectedVectorId = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteConnection(env.DB, vectorize, CONNECTION_ID);

    expect(deletedVectorIds).toEqual([expectedVectorId]);
    expect(vectorize.deleteByIds).toHaveBeenCalledOnce();

    const connectionRow = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first();
    expect(connectionRow).toBeNull();

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceRow).toBeNull();
  });

  it("deletes vectors before D1 rows and leaves the connection row when vector delete fails", async () => {
    await seedConnectionWithIndexedSource();
    let connectionExistedDuringVectors = false;

    const trackVectors: DeleteChunkVectors = async () => {
      const connectionRow = await env.DB.prepare(
        `SELECT id FROM connections WHERE id = ?`,
      )
        .bind(CONNECTION_ID)
        .first();
      connectionExistedDuringVectors = connectionRow !== null;

      const sourceRow = await env.DB.prepare(
        `SELECT id FROM knowledge_sources WHERE id = ?`,
      )
        .bind(SOURCE_ID)
        .first();
      expect(sourceRow).not.toBeNull();
    };

    await deleteConnection(env.DB, env.VECTORIZE, CONNECTION_ID, {
      deleteChunkVectors: trackVectors,
    });

    expect(connectionExistedDuringVectors).toBe(true);

    const failVectors: DeleteChunkVectors = async () => {
      throw new Error("vector delete failed");
    };

    await seedConnectionWithIndexedSource({ skipUser: true });

    await expect(
      deleteConnection(env.DB, env.VECTORIZE, CONNECTION_ID, {
        deleteChunkVectors: failVectors,
      }),
    ).rejects.toThrow(/vector delete failed/);

    const connectionAfterFailure = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first();
    expect(connectionAfterFailure).not.toBeNull();

    const sourceAfterFailure = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first();
    expect(sourceAfterFailure).not.toBeNull();
  });

  it("does not delete another connection's vectors or D1 rows", async () => {
    await seedConnectionWithIndexedSource();
    await seedOtherConnectionWithIndexedSource();

    const targetVectorId = await chunkVectorId(SOURCE_ID, "doc.md", 0);
    const otherVectorId = await chunkVectorId(OTHER_SOURCE_ID, "other-doc.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteConnection(env.DB, vectorize, CONNECTION_ID);

    expect(deletedVectorIds).toEqual([targetVectorId]);
    expect(deletedVectorIds).not.toContain(otherVectorId);

    const otherConnection = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(OTHER_CONNECTION_ID)
      .first();
    expect(otherConnection).not.toBeNull();

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

  it("deleteByIds receives vector ids for every knowledge source on the connection", async () => {
    await seedConnectionWithTwoIndexedSources();

    const vectorIdA = await chunkVectorId(SOURCE_ID, "doc-a.md", 0);
    const vectorIdB = await chunkVectorId(SOURCE_ID_B, "doc-b.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteConnection(env.DB, vectorize, CONNECTION_ID);

    expect(deletedVectorIds.sort()).toEqual([vectorIdA, vectorIdB].sort());
  });
});
