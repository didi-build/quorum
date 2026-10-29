import type { IndexingQueueMessage } from "./indexing-message.js";

export interface KnowledgeSourceRunRow {
  indexing_run_id: string | null;
  indexing_run_files_committed: number | null;
  status: string;
}

export interface ResolveIndexingRunResult {
  stale: boolean;
  runId: string | null;
  mustClaimRun: boolean;
}

export function resolveIndexingRun(
  message: IndexingQueueMessage,
  source: KnowledgeSourceRunRow,
  isFreshRun: boolean,
): ResolveIndexingRunResult {
  const msgRun = message.indexing_run_id ?? null;
  const srcRun = source.indexing_run_id ?? null;
  const progress = source.indexing_run_files_committed ?? 0;

  if (!isFreshRun) {
    if (msgRun !== null && srcRun !== null && msgRun !== srcRun) {
      return { stale: true, runId: null, mustClaimRun: false };
    }
    if (srcRun !== null) {
      const runId = msgRun ?? srcRun;
      return { stale: false, runId, mustClaimRun: false };
    }
    if (msgRun !== null) {
      return { stale: false, runId: msgRun, mustClaimRun: true };
    }
    if (source.status === "indexing") {
      const runId = crypto.randomUUID();
      return { stale: false, runId, mustClaimRun: true };
    }
    return { stale: true, runId: null, mustClaimRun: false };
  }

  if (msgRun !== null && srcRun !== null && msgRun !== srcRun) {
    return { stale: true, runId: null, mustClaimRun: false };
  }

  if (source.status === "indexing") {
    if (progress > 0 && msgRun === null) {
      return { stale: true, runId: null, mustClaimRun: false };
    }
    if (srcRun === null) {
      const runId = crypto.randomUUID();
      return { stale: false, runId, mustClaimRun: true };
    }
    return { stale: false, runId: srcRun, mustClaimRun: false };
  }

  if (source.status === "ready") {
    if (msgRun === null && srcRun !== null) {
      return { stale: true, runId: null, mustClaimRun: false };
    }
    const runId = msgRun ?? crypto.randomUUID();
    const mustClaimRun = srcRun !== runId;
    return { stale: false, runId, mustClaimRun };
  }

  if (source.status === "pending" || source.status === "error") {
    const runId = msgRun ?? crypto.randomUUID();
    const mustClaimRun = srcRun !== runId;
    return { stale: false, runId, mustClaimRun };
  }

  return { stale: true, runId: null, mustClaimRun: false };
}

export type ClaimIndexingRunOutcome = "claimed" | "already" | "lost_race";

export async function claimIndexingRunOnSource(
  db: D1Database,
  sourceId: string,
  runId: string,
  expectedCurrentRunId: string | null,
): Promise<ClaimIndexingRunOutcome> {
  const now = new Date().toISOString();

  const current = await db
    .prepare(`SELECT indexing_run_id FROM knowledge_sources WHERE id = ?`)
    .bind(sourceId)
    .first<{ indexing_run_id: string | null }>();
  if (current?.indexing_run_id === runId) {
    return "already";
  }

  if (expectedCurrentRunId !== null && expectedCurrentRunId !== runId) {
    const replaced = await db
      .prepare(
        `UPDATE knowledge_sources
         SET indexing_run_id = ?, indexing_run_files_committed = 0, updated_at = ?
         WHERE id = ?
           AND indexing_run_id IS ?
           AND status IN ('pending', 'error', 'ready')`,
      )
      .bind(runId, now, sourceId, expectedCurrentRunId)
      .run();
    if ((replaced.meta.changes ?? 0) > 0) {
      return "claimed";
    }
    return "lost_race";
  }

  const assigned = await db
    .prepare(
      `UPDATE knowledge_sources
       SET indexing_run_id = ?, indexing_run_files_committed = 0, updated_at = ?
       WHERE id = ?
         AND indexing_run_id IS NULL
         AND status IN ('pending', 'error', 'ready', 'indexing')`,
    )
    .bind(runId, now, sourceId)
    .run();
  if ((assigned.meta.changes ?? 0) > 0) {
    return "claimed";
  }

  const after = await db
    .prepare(`SELECT indexing_run_id FROM knowledge_sources WHERE id = ?`)
    .bind(sourceId)
    .first<{ indexing_run_id: string | null }>();
  if (after?.indexing_run_id === runId) {
    return "already";
  }
  return "lost_race";
}

export function withIndexingRunId(
  message: IndexingQueueMessage,
  runId: string,
): IndexingQueueMessage {
  return {
    ...message,
    indexing_run_id: runId,
  };
}
