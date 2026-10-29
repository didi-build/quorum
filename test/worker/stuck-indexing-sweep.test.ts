import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../../src/domain/ingestion/errors.js";
import {
  STUCK_INDEXING_SWEEP_THRESHOLD_MS,
  sweepStuckIndexingKnowledgeSources,
} from "../../src/jobs/stuck-indexing-sweep.js";

const USER_ID = "00000000-0000-4000-8000-000000000934";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000935";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const STALE_UPDATED_AT = new Date(
  NOW.getTime() - STUCK_INDEXING_SWEEP_THRESHOLD_MS - 60_000,
).toISOString();
const FRESH_UPDATED_AT = new Date(
  NOW.getTime() - STUCK_INDEXING_SWEEP_THRESHOLD_MS + 60_000,
).toISOString();

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM knowledge_sources").run();
  await env.DB.prepare("DELETE FROM connections").run();
  await env.DB.prepare("DELETE FROM users").run();
}

async function seedConnection(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login) VALUES (?, 934, 'sweep-user')`,
  )
    .bind(USER_ID)
    .run();
  await env.DB.prepare(
    `INSERT INTO connections (
        id, user_id, provider, installation_id, external_account_id, external_account_name
      ) VALUES (?, ?, 'github', '934', 'acct', 'Account')`,
  )
    .bind(CONNECTION_ID, USER_ID)
    .run();
}

async function insertSource(input: {
  id: string;
  status: string;
  updatedAt: string;
  indexingRunId?: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (
        id, user_id, source_type, external_ref, connection_id, name,
        status, status_message, updated_at, indexing_run_id, indexing_run_files_committed
      ) VALUES (?, ?, 'github_repo', 'owner/repo', ?, 'Repo', ?, 'Indexing in progress', ?, ?, ?)`,
  )
    .bind(
      input.id,
      USER_ID,
      CONNECTION_ID,
      input.status,
      input.updatedAt,
      input.indexingRunId ?? null,
      input.indexingRunId ? 3 : null,
    )
    .run();
}

describe("sweepStuckIndexingKnowledgeSources (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
    await seedConnection();
  });

  it("marks indexing sources past the threshold as error with generic message", async () => {
    const stuckId = "00000000-0000-4000-8000-000000000936";
    await insertSource({
      id: stuckId,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
    });

    const result = await sweepStuckIndexingKnowledgeSources(env.DB, {
      now: NOW,
      log: () => {},
    });
    expect(result.totalUpdated).toBe(1);

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(stuckId)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("error");
    expect(row?.status_message).toBe(GENERIC_INDEXING_FAILURE_MESSAGE);
  });

  it("leaves indexing sources just under the threshold unchanged", async () => {
    const freshId = "00000000-0000-4000-8000-000000000937";
    await insertSource({
      id: freshId,
      status: "indexing",
      updatedAt: FRESH_UPDATED_AT,
    });

    const result = await sweepStuckIndexingKnowledgeSources(env.DB, {
      now: NOW,
      log: () => {},
    });
    expect(result.totalUpdated).toBe(0);

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(freshId)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("indexing");
    expect(row?.status_message).toBe("Indexing in progress");
  });

  it("does not change non-indexing sources even when updated_at is stale", async () => {
    const readyId = "00000000-0000-4000-8000-000000000938";
    const pendingId = "00000000-0000-4000-8000-000000000939";
    await insertSource({ id: readyId, status: "ready", updatedAt: STALE_UPDATED_AT });
    await insertSource({
      id: pendingId,
      status: "pending",
      updatedAt: STALE_UPDATED_AT,
    });

    const result = await sweepStuckIndexingKnowledgeSources(env.DB, {
      now: NOW,
      log: () => {},
    });
    expect(result.totalUpdated).toBe(0);

    const ready = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(readyId)
      .first<{ status: string }>();
    const pending = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(pendingId)
      .first<{ status: string }>();
    expect(ready?.status).toBe("ready");
    expect(pending?.status).toBe("pending");
  });

  it("clears indexing_run_id and files committed so late queue messages are stale", async () => {
    const runId = "00000000-0000-4000-8000-000000000940";
    const stuckId = "00000000-0000-4000-8000-000000000941";
    await insertSource({
      id: stuckId,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
      indexingRunId: runId,
    });

    await sweepStuckIndexingKnowledgeSources(env.DB, { now: NOW, log: () => {} });

    const row = await env.DB.prepare(
      `SELECT indexing_run_id, indexing_run_files_committed, status
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(stuckId)
      .first<{
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
        status: string;
      }>();
    expect(row?.status).toBe("error");
    expect(row?.indexing_run_id).toBeNull();
    expect(row?.indexing_run_files_committed).toBeNull();
  });

  it("logs only counts and error names on failure", async () => {
    const log = vi.fn();
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error("D1 unavailable");
          },
        }),
      }),
    } as unknown as D1Database;

    await expect(
      sweepStuckIndexingKnowledgeSources(failingDb, { now: NOW, log }),
    ).rejects.toThrow("D1 unavailable");

    expect(log).toHaveBeenCalledWith({
      event: "stuck_indexing_sweep_failed",
      total_updated: 0,
      error_name: "Error",
    });
  });
});
