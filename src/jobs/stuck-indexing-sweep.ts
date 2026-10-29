import { GENERIC_INDEXING_FAILURE_MESSAGE } from "../domain/ingestion/errors.js";

/** Time in `indexing` before the daily cron marks the source as failed. */
export const STUCK_INDEXING_SWEEP_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export function stuckIndexingSweepCutoffIso(
  now: Date = new Date(),
  thresholdMs: number = STUCK_INDEXING_SWEEP_THRESHOLD_MS,
): string {
  return new Date(now.getTime() - thresholdMs).toISOString();
}

export type StuckIndexingSweepResult = {
  totalUpdated: number;
};

export type StuckIndexingSweepOptions = {
  now?: Date;
  thresholdMs?: number;
  log?: (payload: Record<string, string | number | boolean>) => void;
};

const STUCK_INDEXING_SWEEP_CANDIDATE_WHERE = `
  status = 'indexing'
  AND updated_at < ?
`;

const SWEEP_STUCK_INDEXING_SQL = `
  UPDATE knowledge_sources
  SET
    status = 'error',
    status_message = ?,
    indexing_run_id = NULL,
    indexing_run_files_committed = NULL,
    updated_at = ?
  WHERE ${STUCK_INDEXING_SWEEP_CANDIDATE_WHERE}
`;

/**
 * Marks knowledge sources stuck in `indexing` longer than the threshold as `error`,
 * clears the active indexing run id, and logs counts only.
 */
export async function sweepStuckIndexingKnowledgeSources(
  db: D1Database,
  options: StuckIndexingSweepOptions = {},
): Promise<StuckIndexingSweepResult> {
  const now = options.now ?? new Date();
  const thresholdMs = options.thresholdMs ?? STUCK_INDEXING_SWEEP_THRESHOLD_MS;
  const log = options.log ?? ((payload) => console.log(JSON.stringify(payload)));

  const cutoffIso = stuckIndexingSweepCutoffIso(now, thresholdMs);
  const updatedAtIso = now.toISOString();

  let totalUpdated = 0;

  try {
    const result = await db
      .prepare(SWEEP_STUCK_INDEXING_SQL)
      .bind(GENERIC_INDEXING_FAILURE_MESSAGE, updatedAtIso, cutoffIso)
      .run();
    totalUpdated = result.meta.changes ?? 0;
  } catch (error) {
    log({
      event: "stuck_indexing_sweep_failed",
      total_updated: totalUpdated,
      error_name: error instanceof Error ? error.name : "Error",
    });
    throw error;
  }

  log({
    event: "stuck_indexing_sweep_complete",
    total_updated: totalUpdated,
  });

  return { totalUpdated };
}
