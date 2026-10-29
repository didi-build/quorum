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
      OWNER_ID,
      queued!.indexingRunId,
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

  it("Q1: refresh 1 failed rollback must not wipe refresh 2 state", async () => {
    await seedOwnedReadySource();
    const runB = "00000000-0000-4000-8000-0000000000b1";
    const runC = "00000000-0000-4000-8000-0000000000c1";
    const priorReady = (await env.DB.prepare(
      `SELECT status, status_message, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first()) as KnowledgeSourceReindexSnapshot;

    await env.DB.prepare(
      `UPDATE knowledge_sources
       SET status = 'pending',
           status_message = 'Queued for re-indexing',
           indexing_run_id = ?,
           indexing_run_files_committed = 0
       WHERE id = ?`,
    )
      .bind(runC, OWNED_SOURCE_ID)
      .run();

    const reverted = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
      runB,
      priorReady,
    );
    expect(reverted).toBe(false);

    const row = await env.DB.prepare(
      `SELECT status, indexing_run_id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{ status: string; indexing_run_id: string }>();
    expect(row?.status).toBe("pending");
    expect(row?.indexing_run_id).toBe(runC);
  });

  it("rollback restores null prior indexing_run_id when still on the minted pending run", async () => {
    await seedOwnedReadySource();
    const prior = (await env.DB.prepare(
      `SELECT status, status_message, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first()) as KnowledgeSourceReindexSnapshot;
    expect(prior.indexing_run_id).toBeNull();

    const queued = await markKnowledgeSourceQueuedForReindex(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
    );
    expect(queued).not.toBeNull();

    const reverted = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
      queued!.indexingRunId,
      prior,
    );
    expect(reverted).toBe(true);

    const row = await env.DB.prepare(
      `SELECT status, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{
        status: string;
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
      }>();
    expect(row?.status).toBe("ready");
    expect(row?.indexing_run_id).toBeNull();
  });

  it("rollback does not apply when the source is no longer pending", async () => {
    await seedOwnedReadySource();
    const priorReady = (await env.DB.prepare(
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

    await env.DB.prepare(
      `UPDATE knowledge_sources SET status = 'indexing' WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .run();

    const reverted = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
      queued!.indexingRunId,
      priorReady,
    );
    expect(reverted).toBe(false);

    const row = await env.DB.prepare(
      `SELECT status, indexing_run_id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{ status: string; indexing_run_id: string }>();
    expect(row?.status).toBe("indexing");
    expect(row?.indexing_run_id).toBe(queued!.indexingRunId);
  });

  it("rollback does not apply for wrong owner user_id", async () => {
    await seedOwnedReadySource();
    const priorReady = (await env.DB.prepare(
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

    const reverted = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      WRONG_OWNER_ID,
      queued!.indexingRunId,
      priorReady,
    );
    expect(reverted).toBe(false);

    const row = await env.DB.prepare(
      `SELECT status, indexing_run_id FROM knowledge_sources WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .first<{ status: string; indexing_run_id: string }>();
    expect(row?.status).toBe("pending");
    expect(row?.indexing_run_id).toBe(queued!.indexingRunId);
  });

  it("regression: rollback SQL must scope user_id (mutant without it reverts with wrong owner)", async () => {
    await seedOwnedReadySource();
    const priorReady = (await env.DB.prepare(
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

    const scoped = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      WRONG_OWNER_ID,
      queued!.indexingRunId,
      priorReady,
    );
    expect(scoped).toBe(false);

    const now = new Date().toISOString();
    const mutant = await env.DB.prepare(
      `UPDATE knowledge_sources
       SET status = ?, status_message = ?, indexing_run_id = ?, indexing_run_files_committed = ?, updated_at = ?
       WHERE id = ? AND indexing_run_id = ? AND status = 'pending'`,
    )
      .bind(
        priorReady.status,
        priorReady.status_message,
        priorReady.indexing_run_id,
        priorReady.indexing_run_files_committed,
        now,
        OWNED_SOURCE_ID,
        queued!.indexingRunId,
      )
      .run();
    expect((mutant.meta.changes ?? 0) > 0).toBe(true);
  });

  it("regression: rollback SQL must require status pending (mutant without it reverts indexing)", async () => {
    await seedOwnedReadySource();
    const priorReady = (await env.DB.prepare(
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

    await env.DB.prepare(
      `UPDATE knowledge_sources SET status = 'indexing' WHERE id = ?`,
    )
      .bind(OWNED_SOURCE_ID)
      .run();

    const scoped = await revertKnowledgeSourceAfterFailedRefreshEnqueue(
      env.DB,
      OWNED_SOURCE_ID,
      OWNER_ID,
      queued!.indexingRunId,
      priorReady,
    );
    expect(scoped).toBe(false);

    const now = new Date().toISOString();
    const mutant = await env.DB.prepare(
      `UPDATE knowledge_sources
       SET status = ?, status_message = ?, indexing_run_id = ?, indexing_run_files_committed = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND indexing_run_id = ?`,
    )
      .bind(
        priorReady.status,
        priorReady.status_message,
        priorReady.indexing_run_id,
        priorReady.indexing_run_files_committed,
        now,
        OWNED_SOURCE_ID,
        OWNER_ID,
        queued!.indexingRunId,
      )
      .run();
    expect((mutant.meta.changes ?? 0) > 0).toBe(true);
  });
});
