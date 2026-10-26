/** Days after session end (expires_at or revoked_at, whichever is earlier) before D1 row deletion. */
export const SESSION_PURGE_RETENTION_DAYS = 30;

/** Rows deleted per D1 statement (bounded batch). */
export const SESSION_PURGE_BATCH_SIZE = 200;

/** Safety cap on batch iterations per cron invocation. */
export const SESSION_PURGE_MAX_BATCHES = 500;

/**
 * SQLite GLOB for migration-style ISO 8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS.sssZ`).
 * Rows with other shapes are never purged (avoids lexicographic false positives).
 */
export const SESSION_TIMESTAMP_ISO_GLOB = "????-??-??T??:??:??.???Z";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 UTC string for lexicographic comparison with D1 `sessions` timestamps
 * stored in the expected shape (see SESSION_TIMESTAMP_ISO_GLOB).
 */
export function toIso8601Utc(date: Date): string {
  return date.toISOString();
}

/** Cutoff timestamp: rows with effective end strictly before this are eligible for purge. */
export function sessionPurgeCutoffIso(
  now: Date = new Date(),
  retentionDays: number = SESSION_PURGE_RETENTION_DAYS,
): string {
  return toIso8601Utc(new Date(now.getTime() - retentionDays * MS_PER_DAY));
}

export type SessionPurgeResult = {
  totalDeleted: number;
  batches: number;
  capped: boolean;
};

export type SessionPurgeOptions = {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
  log?: (payload: Record<string, string | number | boolean>) => void;
};

const PURGE_BATCH_SQL = `
  DELETE FROM sessions
  WHERE id IN (
    SELECT id
    FROM sessions
    WHERE expires_at GLOB ?
      AND (revoked_at IS NULL OR revoked_at GLOB ?)
      AND (
        CASE
          WHEN revoked_at IS NOT NULL AND revoked_at < expires_at THEN revoked_at
          ELSE expires_at
        END
      ) < ?
    LIMIT ?
  )
`;

/**
 * Deletes browser auth sessions whose effective end (earlier of expires_at and revoked_at)
 * is more than `retentionDays` before `now`. Idempotent; processes in bounded batches.
 */
export async function purgeExpiredSessions(
  db: D1Database,
  options: SessionPurgeOptions = {},
): Promise<SessionPurgeResult> {
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? SESSION_PURGE_RETENTION_DAYS;
  const batchSize = options.batchSize ?? SESSION_PURGE_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? SESSION_PURGE_MAX_BATCHES;
  const log = options.log ?? ((payload) => console.log(JSON.stringify(payload)));

  const cutoffIso = sessionPurgeCutoffIso(now, retentionDays);
  const isoGlob = SESSION_TIMESTAMP_ISO_GLOB;
  let totalDeleted = 0;
  let batches = 0;
  let lastBatchDeleted = 0;

  try {
    while (batches < maxBatches) {
      const result = await db
        .prepare(PURGE_BATCH_SQL)
        .bind(isoGlob, isoGlob, cutoffIso, batchSize)
        .run();
      const deleted = result.meta.changes ?? 0;
      batches += 1;
      totalDeleted += deleted;
      lastBatchDeleted = deleted;

      if (deleted === 0) {
        break;
      }
      if (deleted < batchSize) {
        break;
      }
    }
  } catch (error) {
    log({
      event: "session_purge_failed",
      total_deleted: totalDeleted,
      batches,
    });
    throw error;
  }

  const capped = batches >= maxBatches && lastBatchDeleted === batchSize;

  log({
    event: "session_purge_complete",
    total_deleted: totalDeleted,
    batches,
    capped,
  });

  return { totalDeleted, batches, capped };
}
