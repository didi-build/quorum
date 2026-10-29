import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  markKnowledgeSourceQueuedForReindex,
  revertKnowledgeSourceAfterFailedRefreshEnqueue,
  type KnowledgeSourceReindexSnapshot,
} from "../../src/domain/db/knowledge-sources.js";

const OWNER_ID = "00000000-0000-4000-8000-000000000010";
const WRONG_OWNER_ID = "00000000-0000-4000-8000-000000000011";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000020";
const OWNED_SOURCE_ID = "00000000-0000-4000-8000-000000000030";
const OWNERLESS_SOURCE_ID = "00000000-0000-4000-8000-000000000031";

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedOwnedReadySource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'owner')`,
  )
    .bind(OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name, status, status_message
      ) VALUES (?, ?, 'github_repo', 'org/repo', ?, 'Repo', 'ready', NULL)`,
  )
    .bind(OWNED_SOURCE_ID, OWNER_ID, CONNECTION_ID)
    .run();
}

async function seedOwnerlessReadySource(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 1, 'owner')`,
  )
    .bind(OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, OWNER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status, status_message
      ) VALUES (?, NULL, NULL, 'github_repo', 'org/shared', ?, 'Shared', 'ready', NULL)`,
  )
    .bind(OWNERLESS_SOURCE_ID, CONNECTION_ID)
    .run();
}

describe("markKnowledgeSourceQueuedForReindex (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
  });

  it("returns null and leaves the row unchanged for a wrong owner user_id", async () => {
    await seedOwnedReadySource();

    const updated = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNED_SOURCE_ID,
      WRONG_OWNER_ID,
    );
    expect(updated).toBeNull();

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.status_message).toBeNull();
  });

  it("returns null and leaves the row unchanged for an ownerless source row", async () => {
    await seedOwnerlessReadySource();

    const updated = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNERLESS_SOURCE_ID,
      OWNER_ID,
    );
    expect(updated).toBeNull();

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNERLESS_SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("ready");
    expect(row?.status_message).toBeNull();
  });

  it("mints a new indexing_run_id and resets committed progress for the owner", async () => {
    await seedOwnedReadySource();
    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = 40
       WHERE id = ?`,
    )
      .bind("00000000-0000-4000-8000-000000000099", OWNED_SOURCE_ID)
      .run();

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
    );
    expect(queued).not.toBeNull();
    expect(queued?.indexingRunId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const row = await env.DB.prepare(
      `SELECT status, status_message, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{
        status: string;
        status_message: string | null;
        indexing_run_id: string;
        indexing_run_files_committed: number | null;
      }>();
    expect(row?.status).toBe("pending");
    expect(row?.status_message).toBe("Queued for re-indexing");
    expect(row?.indexing_run_id).toBe(queued?.indexingRunId);
    expect(row?.indexing_run_files_committed).toBe(0);
  });

  it("reverts refresh mint when indexing enqueue fails", async () => {
    await seedOwnedReadySource();
    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = 40
       WHERE id = ?`,
    )
      .bind("00000000-0000-4000-8000-000000000099", OWNED_SOURCE_ID)
      .run();

    const prior = (await env.DB.prepare(
      `SELECT status, status_message, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first()) as KnowledgeSourceReindexSnapshot;

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
    );
    expect(queued).not.toBeNull();

    await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      prior,
    );

    const row = await env.DB.prepare(
      `SELECT status, status_message, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{
        status: string;
        status_message: string | null;
        indexing_run_id: string;
        indexing_run_files_committed: number;
      }>();
    expect(row?.status).toBe(prior?.status);
    expect(row?.status_message).toBe(prior?.status_message);
    expect(row?.indexing_run_id).toBe(prior?.indexing_run_id);
    expect(row?.indexing_run_files_committed).toBe(prior?.indexing_run_files_committed);
  });
});
