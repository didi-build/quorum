import type { D1Database } from "@cloudflare/workers-types";
import type {
  KnowledgeSourceRead,
  SourceStatus,
  SourceType,
} from "../schemas/sources.js";

export interface KnowledgeSourceRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  source_type: SourceType;
  external_ref: string;
  connection_id: string;
  name: string;
  status: SourceStatus;
  status_message: string | null;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function knowledgeSourceRowToRead(row: KnowledgeSourceRow): KnowledgeSourceRead {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    source_type: row.source_type,
    external_ref: row.external_ref,
    connection_id: row.connection_id,
    name: row.name,
    status: row.status,
    status_message: row.status_message,
    last_indexed_at: row.last_indexed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Matches can_access() for knowledge source rows (same shape as retrieval source scope). */
export const KNOWLEDGE_SOURCE_ACCESS_SQL = `
  (
    (user_id IS NULL AND project_id IS NULL)
    OR (user_id = ?1 AND project_id IS NULL)
    OR (?2 IS NOT NULL AND user_id IS NULL AND project_id = ?2)
    OR (?2 IS NOT NULL AND user_id = ?1 AND project_id = ?2)
  )
`;

export async function listKnowledgeSourceRows(
  db: D1Database,
  actorUserId: string,
  actorProjectId: string | null,
): Promise<KnowledgeSourceRow[]> {
  const result = await db
    .prepare(`SELECT * FROM knowledge_sources WHERE ${KNOWLEDGE_SOURCE_ACCESS_SQL}`)
    .bind(actorUserId, actorProjectId)
    .all<KnowledgeSourceRow>();
  return result.results ?? [];
}

export async function getKnowledgeSourceRowById(
  db: D1Database,
  sourceId: string,
): Promise<KnowledgeSourceRow | null> {
  return await db
    .prepare("SELECT * FROM knowledge_sources WHERE id = ?")
    .bind(sourceId)
    .first<KnowledgeSourceRow>();
}

export interface InsertKnowledgeSourceInput {
  id: string;
  userId: string;
  projectId: string | null;
  sourceType: SourceType;
  externalRef: string;
  connectionId: string;
  name: string;
}

export async function insertKnowledgeSource(
  db: D1Database,
  input: InsertKnowledgeSourceInput,
): Promise<KnowledgeSourceRow> {
  await db
    .prepare(
      `INSERT INTO knowledge_sources (
        id, user_id, project_id, source_type, external_ref, connection_id, name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .bind(
      input.id,
      input.userId,
      input.projectId,
      input.sourceType,
      input.externalRef,
      input.connectionId,
      input.name,
    )
    .run();

  const row = await getKnowledgeSourceRowById(db, input.id);
  if (row === null) {
    throw new Error("Failed to load knowledge source after insert");
  }
  return row;
}

export interface QueuedForReindexResult {
  row: KnowledgeSourceRow;
  indexingRunId: string;
}

export async function markKnowledgeSourceQueuedForReindex(
  db: D1Database,
  sourceId: string,
  ownerUserId: string,
): Promise<QueuedForReindexResult | null> {
  const now = new Date().toISOString();
  const indexingRunId = crypto.randomUUID();
  const result = await db
    .prepare(
      `UPDATE knowledge_sources
       SET status = 'pending',
           status_message = ?,
           updated_at = ?,
           indexing_run_id = ?,
           indexing_run_files_committed = 0
       WHERE id = ? AND user_id = ?`,
    )
    .bind("Queued for re-indexing", now, indexingRunId, sourceId, ownerUserId)
    .run();
  if (result.meta.changes === 0) {
    return null;
  }
  const row = await getKnowledgeSourceRowById(db, sourceId);
  if (row === null) {
    return null;
  }
  return { row, indexingRunId };
}
