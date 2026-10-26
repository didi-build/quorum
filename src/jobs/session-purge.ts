/** Days after session end (expires_at or revoked_at, whichever is earlier) before D1 row deletion. */
export const SESSION_PURGE_RETENTION_DAYS = 30;

/** Rows deleted per D1 statement (bounded batch). */
export const SESSION_PURGE_BATCH_SIZE = 200;

/** Safety cap on batch iterations per cron invocation. */
export const SESSION_PURGE_MAX_BATCHES = 500;

/**
 * D1 rejects one monolithic digit-class GLOB for the full timestamp; validate with literals
 * plus segment digit-class GLOBs for canonical 3-digit-ms UTC ISO (`toISOString()` shape).
 */
export function sessionTimestampIsoSqlMatch(column: string): string {
  return `(
    length(${column}) = 24
    AND substr(${column}, 5, 1) = '-'
    AND substr(${column}, 8, 1) = '-'
    AND substr(${column}, 11, 1) = 'T'
    AND substr(${column}, 14, 1) = ':'
    AND substr(${column}, 17, 1) = ':'
    AND substr(${column}, 20, 1) = '.'
    AND substr(${column}, 24, 1) = 'Z'
    AND substr(${column}, 1, 4) GLOB '[0-9][0-9][0-9][0-9]'
    AND substr(${column}, 6, 2) GLOB '[0-9][0-9]'
    AND substr(${column}, 9, 2) GLOB '[0-9][0-9]'
    AND substr(${column}, 12, 2) GLOB '[0-9][0-9]'
    AND substr(${column}, 15, 2) GLOB '[0-9][0-9]'
    AND substr(${column}, 18, 2) GLOB '[0-9][0-9]'
    AND substr(${column}, 21, 3) GLOB '[0-9][0-9][0-9]'
  )`;
}

const SESSION_EXPIRES_ISO_MATCH = sessionTimestampIsoSqlMatch("expires_at");
const SESSION_REVOKED_ISO_MATCH = sessionTimestampIsoSqlMatch("revoked_at");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 UTC string for lexicographic comparison with D1 `sessions` timestamps
 * in the canonical `toISOString()` shape.
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
  malformedTimestampSkipped: number;
};

export type SessionPurgeOptions = {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
  log?: (payload: Record<string, string | number | boolean>) => void;
};

const SESSION_PURGE_CANDIDATE_WHERE = `
    ${SESSION_EXPIRES_ISO_MATCH}
    AND (revoked_at IS NULL OR ${SESSION_REVOKED_ISO_MATCH})
    AND (expires_at < ? OR revoked_at < ?)
    AND (
      CASE
        WHEN revoked_at IS NOT NULL AND revoked_at < expires_at THEN revoked_at
        ELSE expires_at
      END
    ) < ?
`;

/** Inner SELECT for purge candidates (used by DELETE and EXPLAIN QUERY PLAN tests). */
export const SESSION_PURGE_CANDIDATE_SELECT_SQL = `
  SELECT id
  FROM sessions
  WHERE ${SESSION_PURGE_CANDIDATE_WHERE}
`;

const COUNT_MALFORMED_TIMESTAMPS_SQL = `
  SELECT COUNT(*) AS c
  FROM sessions
  WHERE NOT (
    ${SESSION_EXPIRES_ISO_MATCH}
    AND (revoked_at IS NULL OR ${SESSION_REVOKED_ISO_MATCH})
  )
`;

const PURGE_BATCH_SQL = `
  DELETE FROM sessions
  WHERE id IN (
    ${SESSION_PURGE_CANDIDATE_SELECT_SQL}
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

  let malformedTimestampSkipped = 0;
  let totalDeleted = 0;
  let batches = 0;
  let lastBatchDeleted = 0;
  let capped = false;

  try {
    while (batches < maxBatches) {
      const result = await db
        .prepare(PURGE_BATCH_SQL)
        .bind(cutoffIso, cutoffIso, cutoffIso, batchSize)
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

    capped = batches >= maxBatches && lastBatchDeleted === batchSize;

    const malformedRow = await db
      .prepare(COUNT_MALFORMED_TIMESTAMPS_SQL)
      .first<{ c: number }>();
    malformedTimestampSkipped = malformedRow?.c ?? 0;
  } catch (error) {
    log({
      event: "session_purge_failed",
      total_deleted: totalDeleted,
      batches,
    });
    throw error;
  }

  log({
    event: "session_purge_complete",
    total_deleted: totalDeleted,
    batches,
    capped,
    malformed_timestamp_skipped: malformedTimestampSkipped,
  });

  return { totalDeleted, batches, capped, malformedTimestampSkipped };
}
