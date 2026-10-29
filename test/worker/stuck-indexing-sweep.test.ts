import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../../src/domain/ingestion/errors.js";
import { indexKnowledgeSource } from "../../src/domain/ingestion/pipeline.js";
import {
  STUCK_INDEXING_SWEEP_THRESHOLD_MS,
  stuckIndexingSweepCutoffIso,
  sweepStuckIndexingKnowledgeSources,
} from "../../src/jobs/stuck-indexing-sweep.js";
import worker from "../../src/index";
import { workerEnvWithSecrets } from "./test-env.js";

const USER_ID = "00000000-0000-4000-8000-000000000934";
const CONNECTION_ID = "00000000-0000-4000-8000-000000000935";
const SOURCE_ID = "00000000-0000-4000-8000-000000000936";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const TWO_HOURS_MS = 7_200_000;
const STALE_UPDATED_AT = new Date(NOW.getTime() - TWO_HOURS_MS - 60_000).toISOString();
const FRESH_UPDATED_AT = new Date(NOW.getTime() - TWO_HOURS_MS + 60_000).toISOString();

const config = loadConfig(workerEnvWithSecrets(env));

async function clearData(): Promise<void> {
  await env.DB.prepare("DELETE FROM chunks").run();
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
  filesCommitted?: number | null;
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
      input.filesCommitted ?? (input.indexingRunId ? 3 : null),
    )
    .run();
}

describe("sweepStuckIndexingKnowledgeSources (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
    await seedConnection();
  });

  it("pins STUCK_INDEXING_SWEEP_THRESHOLD_MS at two hours", () => {
    expect(STUCK_INDEXING_SWEEP_THRESHOLD_MS).toBe(TWO_HOURS_MS);
  });

  it("marks indexing sources past the threshold (2h01m) as error with generic message", async () => {
    await insertSource({
      id: SOURCE_ID,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
    });

    const log = vi.fn();
    const result = await sweepStuckIndexingKnowledgeSources(env.DB, { now: NOW, log });
    expect(result.totalUpdated).toBe(1);
    expect(log).toHaveBeenCalledWith({
      event: "stuck_indexing_sweep_complete",
      total_updated: 1,
    });

    const row = await env.DB.prepare(
      `SELECT status, status_message, updated_at FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        status: string;
        status_message: string | null;
        updated_at: string;
      }>();
    expect(row?.status).toBe("error");
    expect(row?.status_message).toBe(GENERIC_INDEXING_FAILURE_MESSAGE);
    expect(row?.updated_at).toBe(NOW.toISOString());
  });

  it("leaves indexing sources just under the threshold (1h59m) unchanged", async () => {
    const freshId = "00000000-0000-4000-8000-000000000937";
    await insertSource({
      id: freshId,
      status: "indexing",
      updatedAt: FRESH_UPDATED_AT,
    });

    const log = vi.fn();
    const result = await sweepStuckIndexingKnowledgeSources(env.DB, { now: NOW, log });
    expect(result.totalUpdated).toBe(0);
    expect(log).toHaveBeenCalledWith({
      event: "stuck_indexing_sweep_complete",
      total_updated: 0,
    });

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(freshId)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("indexing");
    expect(row?.status_message).toBe("Indexing in progress");
  });

  it("does not sweep a row whose updated_at equals the cutoff exactly", async () => {
    const boundaryId = "00000000-0000-4000-8000-000000000942";
    const cutoffIso = stuckIndexingSweepCutoffIso(NOW);
    await insertSource({
      id: boundaryId,
      status: "indexing",
      updatedAt: cutoffIso,
    });

    const result = await sweepStuckIndexingKnowledgeSources(env.DB, {
      now: NOW,
      log: () => {},
    });
    expect(result.totalUpdated).toBe(0);

    const row = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(boundaryId)
      .first<{ status: string }>();
    expect(row?.status).toBe("indexing");
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

  it("clears indexing_run_id and files committed on sweep", async () => {
    const runId = "00000000-0000-4000-8000-000000000940";
    const stuckId = "00000000-0000-4000-8000-000000000941";
    await insertSource({
      id: stuckId,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
      indexingRunId: runId,
      filesCommitted: 5,
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

  it("drops a late continuation with the swept run id without mutating the source", async () => {
    const runId = "00000000-0000-4000-8000-000000000943";
    await insertSource({
      id: SOURCE_ID,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
      indexingRunId: runId,
      filesCommitted: 10,
    });

    await sweepStuckIndexingKnowledgeSources(env.DB, { now: NOW, log: () => {} });

    const afterSweep = await env.DB.prepare(
      `SELECT status, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        status: string;
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
      }>();
    expect(afterSweep?.status).toBe("error");
    expect(afterSweep?.indexing_run_id).toBeNull();

    const githubFetch = vi.fn(async () => {
      throw new Error("github fetch must not run for stale continuation");
    });

    const result = await indexKnowledgeSource(
      env.DB,
      env.VECTORIZE,
      config,
      {
        source_id: SOURCE_ID,
        indexing_run_id: runId,
        github_files_processed: 10,
      },
      { fetchGithubRepoDocuments: githubFetch },
    );

    expect(result.stale).toBe(true);
    expect(githubFetch).not.toHaveBeenCalled();

    const afterContinuation = await env.DB.prepare(
      `SELECT status, indexing_run_id, indexing_run_files_committed
       FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{
        status: string;
        indexing_run_id: string | null;
        indexing_run_files_committed: number | null;
      }>();
    expect(afterContinuation).toEqual(afterSweep);

    const chunkCount = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM chunks WHERE knowledge_source_id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ c: number }>();
    expect(chunkCount?.c).toBe(0);
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

describe("Worker scheduled stuck indexing sweep (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
    await seedConnection();
  });

  it("marks a stuck indexing source as error via worker.scheduled", async () => {
    await insertSource({
      id: SOURCE_ID,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
    });

    const controller = createScheduledController({
      cron: "0 4 * * *",
      scheduledTime: NOW,
    });
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const row = await env.DB.prepare(
      `SELECT status, status_message FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string; status_message: string | null }>();
    expect(row?.status).toBe("error");
    expect(row?.status_message).toBe(GENERIC_INDEXING_FAILURE_MESSAGE);
  });
});

function wrapDbWithFailingSessionPurge(database: D1Database): D1Database {
  const originalPrepare = database.prepare.bind(database);
  return {
    prepare(sql: string) {
      const statement = originalPrepare(sql);
      if (!sql.includes("DELETE FROM sessions")) {
        return statement;
      }
      return {
        bind: (...args: unknown[]) => {
          const bound = statement.bind(...args);
          return {
            ...bound,
            run: async () => {
              throw new Error("session purge failed");
            },
          };
        },
      } as unknown as D1PreparedStatement;
    },
    batch: database.batch.bind(database),
    exec: database.exec.bind(database),
  } as D1Database;
}

describe("Worker scheduled job isolation (integration, vitest-pool-workers)", () => {
  beforeEach(async () => {
    await clearData();
    await seedConnection();
  });

  it("still runs the stuck indexing sweep when session purge throws", async () => {
    await insertSource({
      id: SOURCE_ID,
      status: "indexing",
      updatedAt: STALE_UPDATED_AT,
    });

    const failingDb = wrapDbWithFailingSessionPurge(env.DB);
    const controller = createScheduledController({
      cron: "0 4 * * *",
      scheduledTime: NOW,
    });
    const ctx = createExecutionContext();

    await expect(
      worker.scheduled(controller, { ...env, DB: failingDb }, ctx),
    ).rejects.toThrow("session purge failed");
    await waitOnExecutionContext(ctx);

    const row = await env.DB.prepare(
      `SELECT status FROM knowledge_sources WHERE id = ?`,
    )
      .bind(SOURCE_ID)
      .first<{ status: string }>();
    expect(row?.status).toBe("error");
  });
});
