import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { resetBootstrapApiKeyGuard } from "../../src/domain/auth/api-key.js";
import type { DeleteChunkVectors } from "../../src/domain/ingestion/delete-vectors.js";
import * as deleteVectors from "../../src/domain/ingestion/delete-vectors.js";
import { chunkVectorId } from "../../src/domain/ingestion/vector-id.js";
import { deleteConnection } from "../../src/domain/connections/delete-connection.js";
import { clearInstallationTokenCache } from "../../src/domain/oauth/github-app.js";
import worker from "../../src/index";
import { generateTestPrivateKeyBase64 } from "../fixtures/github-app-test-key.js";
import { withTestConfigEnv } from "../fixtures/config-env.js";
import { workerEnvWithSecrets } from "./test-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000070";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000071";
const SOURCE_ID = "00000000-0000-4000-8000-000000000072";
const SOURCE_ID_B = "00000000-0000-4000-8000-000000000073";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000074";
const OTHER_CONNECTION_ID = "00000000-0000-4000-8000-000000000075";
const OTHER_SOURCE_ID = "00000000-0000-4000-8000-000000000076";
const FOREIGN_ON_CONN_SOURCE_ID = "00000000-0000-4000-8000-000000000077";
const SHARED_SOURCE_ID = "00000000-0000-4000-8000-000000000078";
const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const ROUTE_OWNED_SOURCE_ID = "00000000-0000-4000-8000-000000000080";
const ROUTE_FOREIGN_SOURCE_ID = "00000000-0000-4000-8000-000000000081";
const ROUTE_FOREIGN_FIRST_SOURCE_ID = "00000000-0000-4000-8000-000000000082";
const ROUTE_OWNED_SECOND_SOURCE_ID = "00000000-0000-4000-8000-000000000083";

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

async function seedConnectionWithForeignOwnedSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 70, 'conn-host')`,
  )
    .bind(USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 74, 'foreign-owner')`,
  )
    .bind(OTHER_USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'shared-acct', 'Shared')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/foreign', ?, 'Foreign repo', 'ready')`,
  )
    .bind(FOREIGN_ON_CONN_SOURCE_ID, OTHER_USER_ID, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'foreign.md', 0, 'foreign chunk', '[]')`,
  )
    .bind(FOREIGN_ON_CONN_SOURCE_ID)
    .run();
}

async function seedConnectionWithOwnedAndForeignSources(options: {
  ownedSourceId: string;
  foreignSourceId: string;
  insertForeignFirst: boolean;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 70, 'conn-host')`,
  )
    .bind(USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 74, 'foreign-owner')`,
  )
    .bind(OTHER_USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'shared-acct', 'Shared')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();

  const insertOwned = async (): Promise<void> => {
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, 'github_repo', 'org/owned', ?, 'Owned', 'ready')`,
    )
      .bind(options.ownedSourceId, USER_ID, CONNECTION_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'owned.md', 0, 'owned chunk', '[]')`,
    )
      .bind(options.ownedSourceId)
      .run();
  };

  const insertForeign = async (): Promise<void> => {
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, 'github_repo', 'org/foreign', ?, 'Foreign', 'ready')`,
    )
      .bind(options.foreignSourceId, OTHER_USER_ID, CONNECTION_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'foreign-pair.md', 0, 'foreign chunk', '[]')`,
    )
      .bind(options.foreignSourceId)
      .run();
  };

  if (options.insertForeignFirst) {
    await insertForeign();
    await insertOwned();
  } else {
    await insertOwned();
    await insertForeign();
  }
}

async function seedConnectionWithSharedNullOwnerSource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 70, 'shared-source-user')`,
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
    .bind(SHARED_SOURCE_ID, CONNECTION_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'shared.md', 0, 'shared chunk', '[]')`,
  )
    .bind(SHARED_SOURCE_ID)
    .run();
}

async function workerBindings() {
  const privateKeyBase64 = await generateTestPrivateKeyBase64();
  return workerEnvWithSecrets({
    ...env,
    ...withTestConfigEnv({
      AUTH_ALLOWED_GITHUB_IDS: "1",
      GITHUB_APP_ID: "123456",
      GITHUB_APP_SLUG: "quorum-test-app",
      GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
    }),
  });
}

async function expectConnectionSourcesAndChunksIntact(
  connectionId: string,
  sourceIds: string[],
): Promise<void> {
  const connectionRow = await env.DB.prepare(`SELECT id FROM connections WHERE id = ?`)
    .bind(connectionId)
    .first();
  expect(connectionRow).not.toBeNull();

  for (const sourceId of sourceIds) {
    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(sourceId)
      .first();
    expect(sourceRow).not.toBeNull();

    const chunkRow = await env.DB.prepare(
      `SELECT id FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(sourceId)
      .first();
    expect(chunkRow).not.toBeNull();
  }
}

async function installConnectionDeleteAbortTrigger(
  connectionId: string,
): Promise<void> {
  await env.DB.prepare("DROP TRIGGER IF EXISTS qa_block_connection_delete").run();
  await env.DB.prepare(
    `CREATE TRIGGER qa_block_connection_delete
     BEFORE DELETE ON connections
     FOR EACH ROW
     WHEN OLD.id = '${connectionId}'
     BEGIN
       SELECT RAISE(ABORT, 'qa_block_connection_delete');
     END`,
  ).run();
}

async function removeConnectionDeleteAbortTrigger(): Promise<void> {
  await env.DB.prepare("DROP TRIGGER IF EXISTS qa_block_connection_delete").run();
}

async function insertRouteConnectionWithSources(options: {
  connectionId: string;
  ownedSourceId: string;
  foreignSourceId: string;
  foreignOwnerId: string;
  insertForeignFirst: boolean;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 2, 'route-foreign-owner')`,
  )
    .bind(options.foreignOwnerId)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
  )
    .bind(options.connectionId, DEFAULT_USER_ID)
    .run();

  const insertOwned = async (): Promise<void> => {
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, 'github_repo', 'org/route-owned', ?, 'Route owned', 'ready')`,
    )
      .bind(options.ownedSourceId, DEFAULT_USER_ID, options.connectionId)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'route-owned.md', 0, 'owned', '[]')`,
    )
      .bind(options.ownedSourceId)
      .run();
  };

  const insertForeign = async (): Promise<void> => {
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
          id, user_id, source_type, external_ref, connection_id, name, status
        ) VALUES (?, ?, 'github_repo', 'org/route-foreign', ?, 'Route foreign', 'ready')`,
    )
      .bind(options.foreignSourceId, options.foreignOwnerId, options.connectionId)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
          knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
        ) VALUES (?, 'route-foreign.md', 0, 'foreign', '[]')`,
    )
      .bind(options.foreignSourceId)
      .run();
  };

  if (options.insertForeignFirst) {
    await insertForeign();
    await insertOwned();
  } else {
    await insertOwned();
    await insertForeign();
  }
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

  it("deletes vectors before D1 rows and leaves all rows when vector delete fails", async () => {
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

  it("purges foreign-owned sources on the connection", async () => {
    await seedConnectionWithForeignOwnedSource();
    const foreignVectorId = await chunkVectorId(
      FOREIGN_ON_CONN_SOURCE_ID,
      "foreign.md",
      0,
    );
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteConnection(env.DB, vectorize, CONNECTION_ID);

    expect(deletedVectorIds).toEqual([foreignVectorId]);

    const foreignSource = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(FOREIGN_ON_CONN_SOURCE_ID)
      .first();
    expect(foreignSource).toBeNull();

    const connectionRow = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first();
    expect(connectionRow).toBeNull();

    const foreignOwner = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(OTHER_USER_ID)
      .first();
    expect(foreignOwner).not.toBeNull();
  });

  it("purges owned and foreign sources without partial D1 deletes when vector delete fails", async () => {
    await seedConnectionWithOwnedAndForeignSources({
      ownedSourceId: ROUTE_OWNED_SECOND_SOURCE_ID,
      foreignSourceId: ROUTE_FOREIGN_FIRST_SOURCE_ID,
      insertForeignFirst: true,
    });

    let vectorPassCount = 0;
    const failOnSecondSource: DeleteChunkVectors = async () => {
      vectorPassCount += 1;
      if (vectorPassCount === 2) {
        throw new Error("vector delete failed");
      }
    };

    await expect(
      deleteConnection(env.DB, env.VECTORIZE, CONNECTION_ID, {
        deleteChunkVectors: failOnSecondSource,
      }),
    ).rejects.toThrow(/vector delete failed/);

    const connectionRow = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first();
    expect(connectionRow).not.toBeNull();

    const ownedSource = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(ROUTE_OWNED_SECOND_SOURCE_ID)
      .first();
    expect(ownedSource).not.toBeNull();

    const foreignSource = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(ROUTE_FOREIGN_FIRST_SOURCE_ID)
      .first();
    expect(foreignSource).not.toBeNull();
  });

  it("purges vectors in source id order before any D1 batch delete", async () => {
    await seedConnectionWithOwnedAndForeignSources({
      ownedSourceId: ROUTE_OWNED_SOURCE_ID,
      foreignSourceId: ROUTE_FOREIGN_SOURCE_ID,
      insertForeignFirst: true,
    });

    const vectorCallOrder: string[][] = [];
    const trackVectors: DeleteChunkVectors = async (_vectorize, vectorIds) => {
      vectorCallOrder.push([...vectorIds]);
      const sourceCount = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM knowledge_sources WHERE connection_id = ?`,
      )
        .bind(CONNECTION_ID)
        .first<{ count: number }>();
      expect(sourceCount?.count).toBe(2);
    };

    await deleteConnection(env.DB, env.VECTORIZE, CONNECTION_ID, {
      deleteChunkVectors: trackVectors,
    });

    const ownedVectorId = await chunkVectorId(ROUTE_OWNED_SOURCE_ID, "owned.md", 0);
    const foreignVectorId = await chunkVectorId(
      ROUTE_FOREIGN_SOURCE_ID,
      "foreign-pair.md",
      0,
    );

    expect(vectorCallOrder).toEqual([[ownedVectorId], [foreignVectorId]]);
  });

  it("rolls back all D1 deletes when the connection row delete fails inside batch", async () => {
    await seedConnectionWithOwnedAndForeignSources({
      ownedSourceId: ROUTE_OWNED_SOURCE_ID,
      foreignSourceId: ROUTE_FOREIGN_SOURCE_ID,
      insertForeignFirst: true,
    });

    await installConnectionDeleteAbortTrigger(CONNECTION_ID);

    try {
      await expect(
        deleteConnection(env.DB, env.VECTORIZE, CONNECTION_ID, {
          deleteChunkVectors: async () => {},
        }),
      ).rejects.toThrow(/qa_block_connection_delete/);

      await expectConnectionSourcesAndChunksIntact(CONNECTION_ID, [
        ROUTE_OWNED_SOURCE_ID,
        ROUTE_FOREIGN_SOURCE_ID,
      ]);
    } finally {
      await removeConnectionDeleteAbortTrigger();
    }
  });

  it("purges vectors then D1 rows for NULL-owner shared sources on the connection", async () => {
    await seedConnectionWithSharedNullOwnerSource();
    const expectedVectorId = await chunkVectorId(SHARED_SOURCE_ID, "shared.md", 0);
    const deletedVectorIds: string[] = [];
    const vectorize = {
      deleteByIds: vi.fn(async (ids: string[]) => {
        deletedVectorIds.push(...ids);
      }),
    } as unknown as VectorizeIndex;

    await deleteConnection(env.DB, vectorize, CONNECTION_ID);

    expect(deletedVectorIds).toEqual([expectedVectorId]);

    const sourceRow = await env.DB.prepare(
      `SELECT id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SHARED_SOURCE_ID)
      .first();
    expect(sourceRow).toBeNull();

    const connectionRow = await env.DB.prepare(
      `SELECT id FROM connections WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first();
    expect(connectionRow).toBeNull();
  });
});

describe("DELETE /connections/:id vector cleanup (worker integration)", () => {
  const ROUTE_FOREIGN_OWNER_ID = "00000000-0000-4000-8000-000000000090";

  beforeEach(async () => {
    resetBootstrapApiKeyGuard();
    clearInstallationTokenCache();
    await env.DB.prepare("DELETE FROM chunks").run();
    await env.DB.prepare("DELETE FROM knowledge_sources").run();
    await env.DB.prepare("DELETE FROM connections").run();
    await env.DB.prepare("DELETE FROM api_keys").run();
    await env.DB.prepare("DELETE FROM users").run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 1, 'default-user')",
    )
      .bind(DEFAULT_USER_ID)
      .run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DELETE /connections/{id} removes chunk vectors before the connection row", async () => {
    const bindings = await workerBindings();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '2001', 'acct-own', 'own-user')`,
    )
      .bind(connectionId, DEFAULT_USER_ID)
      .run();
    await env.DB.prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, 'github_repo', 'org/route', ?, 'Route repo', 'ready')`,
    )
      .bind(sourceId, DEFAULT_USER_ID, connectionId)
      .run();
    await env.DB.prepare(
      `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, 'route-doc.md', 0, 'route chunk', '[]')`,
    )
      .bind(sourceId)
      .run();

    const expectedVectorId = await chunkVectorId(sourceId, "route-doc.md", 0);
    const deleteVectorsSpy = vi
      .spyOn(deleteVectors, "deleteChunkVectors")
      .mockImplementation(async (_vectorize, vectorIds) => {
        const connectionRow = await env.DB.prepare(
          "SELECT id FROM connections WHERE id = ?",
        )
          .bind(connectionId)
          .first();
        expect(connectionRow).not.toBeNull();
        expect(vectorIds).toEqual([expectedVectorId]);
      });

    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`http://test/connections/${connectionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(204);
    expect(deleteVectorsSpy).toHaveBeenCalledTimes(1);
    expect(deleteVectorsSpy.mock.calls[0]?.[1]).toEqual([expectedVectorId]);

    const connectionRow = await env.DB.prepare(
      "SELECT id FROM connections WHERE id = ?",
    )
      .bind(connectionId)
      .first();
    expect(connectionRow).toBeNull();
  });

  it.each([
    {
      label: "owned source inserted before foreign",
      ownedSourceId: ROUTE_OWNED_SOURCE_ID,
      foreignSourceId: ROUTE_FOREIGN_SOURCE_ID,
      insertForeignFirst: false,
    },
    {
      label: "foreign source inserted before owned",
      ownedSourceId: ROUTE_OWNED_SECOND_SOURCE_ID,
      foreignSourceId: ROUTE_FOREIGN_FIRST_SOURCE_ID,
      insertForeignFirst: true,
    },
  ])(
    "DELETE /connections/{id} purges owned and foreign sources ($label)",
    async ({ ownedSourceId, foreignSourceId, insertForeignFirst }) => {
      const bindings = await workerBindings();
      const cfg = loadConfig(bindings);
      const connectionId = crypto.randomUUID();

      await insertRouteConnectionWithSources({
        connectionId,
        ownedSourceId,
        foreignSourceId,
        foreignOwnerId: ROUTE_FOREIGN_OWNER_ID,
        insertForeignFirst,
      });

      const deletedVectorIdBatches: string[][] = [];
      const deleteVectorsSpy = vi
        .spyOn(deleteVectors, "deleteChunkVectors")
        .mockImplementation(async (_vectorize, vectorIds) => {
          deletedVectorIdBatches.push([...vectorIds]);
        });

      const ctx = createExecutionContext();
      const response = await worker.fetch(
        new Request(`http://test/connections/${connectionId}`, {
          method: "DELETE",
          headers: { "X-API-Key": cfg.bootstrapApiKey },
        }),
        bindings,
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(204);

      const sortedSourceIds = [ownedSourceId, foreignSourceId].sort();
      const expectedVectorOrder = await Promise.all(
        sortedSourceIds.map(async (sourceId) => {
          const doc =
            sourceId === ownedSourceId ? "route-owned.md" : "route-foreign.md";
          return chunkVectorId(sourceId, doc, 0);
        }),
      );
      expect(deletedVectorIdBatches).toEqual(
        expectedVectorOrder.map((vectorId) => [vectorId]),
      );
      expect(deleteVectorsSpy).toHaveBeenCalledTimes(2);

      const ownedRow = await env.DB.prepare(
        "SELECT id FROM knowledge_sources WHERE id = ?",
      )
        .bind(ownedSourceId)
        .first();
      expect(ownedRow).toBeNull();

      const foreignRow = await env.DB.prepare(
        "SELECT id FROM knowledge_sources WHERE id = ?",
      )
        .bind(foreignSourceId)
        .first();
      expect(foreignRow).toBeNull();

      const connectionRow = await env.DB.prepare(
        "SELECT id FROM connections WHERE id = ?",
      )
        .bind(connectionId)
        .first();
      expect(connectionRow).toBeNull();
    },
  );

  it("returns 500 when the second vector delete fails, then 204 on retry after all rows removed", async () => {
    const bindings = await workerBindings();
    const cfg = loadConfig(bindings);
    const connectionId = crypto.randomUUID();
    const ownedSourceId = ROUTE_OWNED_SOURCE_ID;
    const foreignSourceId = ROUTE_FOREIGN_SOURCE_ID;

    await insertRouteConnectionWithSources({
      connectionId,
      ownedSourceId,
      foreignSourceId,
      foreignOwnerId: ROUTE_FOREIGN_OWNER_ID,
      insertForeignFirst: true,
    });

    const sortedSourceIds = [ownedSourceId, foreignSourceId].sort();
    const expectedVectorOrder = await Promise.all(
      sortedSourceIds.map(async (sourceId) => {
        const doc = sourceId === ownedSourceId ? "route-owned.md" : "route-foreign.md";
        return chunkVectorId(sourceId, doc, 0);
      }),
    );

    let vectorCallCount = 0;
    const deleteVectorsSpy = vi
      .spyOn(deleteVectors, "deleteChunkVectors")
      .mockImplementation(async (_vectorize, vectorIds) => {
        vectorCallCount += 1;
        if (vectorCallCount === 2) {
          throw new Error("vector delete failed");
        }
        expect(vectorIds).toEqual([expectedVectorOrder[vectorCallCount - 1]]);
      });

    const failCtx = createExecutionContext();
    const failResponse = await worker.fetch(
      new Request(`http://test/connections/${connectionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      failCtx,
    );
    await waitOnExecutionContext(failCtx);

    expect(failResponse.status).toBe(500);
    expect(deleteVectorsSpy).toHaveBeenCalledTimes(2);
    await expectConnectionSourcesAndChunksIntact(connectionId, [
      ownedSourceId,
      foreignSourceId,
    ]);

    deleteVectorsSpy.mockRestore();
    const retryDeletedBatches: string[][] = [];
    vi.spyOn(deleteVectors, "deleteChunkVectors").mockImplementation(
      async (_vectorize, vectorIds) => {
        retryDeletedBatches.push([...vectorIds]);
      },
    );

    const retryCtx = createExecutionContext();
    const retryResponse = await worker.fetch(
      new Request(`http://test/connections/${connectionId}`, {
        method: "DELETE",
        headers: { "X-API-Key": cfg.bootstrapApiKey },
      }),
      bindings,
      retryCtx,
    );
    await waitOnExecutionContext(retryCtx);

    expect(retryResponse.status).toBe(204);
    expect(retryDeletedBatches).toEqual(
      expectedVectorOrder.map((vectorId) => [vectorId]),
    );

    const ownedRow = await env.DB.prepare(
      "SELECT id FROM knowledge_sources WHERE id = ?",
    )
      .bind(ownedSourceId)
      .first();
    expect(ownedRow).toBeNull();

    const foreignRow = await env.DB.prepare(
      "SELECT id FROM knowledge_sources WHERE id = ?",
    )
      .bind(foreignSourceId)
      .first();
    expect(foreignRow).toBeNull();

    const connectionRow = await env.DB.prepare(
      "SELECT id FROM connections WHERE id = ?",
    )
      .bind(connectionId)
      .first();
    expect(connectionRow).toBeNull();
  });
});
