import { deleteConnectionById, getConnectionById } from "../db/connections.js";
import {
  deleteChunkVectors,
  type DeleteChunkVectors,
} from "../ingestion/delete-vectors.js";
import { vectorIdsForChunks } from "../ingestion/vector-id.js";
import type { DeleteKnowledgeSourceOptions } from "../knowledge-sources/delete.js";

export type DeleteConnectionOptions = DeleteKnowledgeSourceOptions;

async function purgeKnowledgeSourceVectors(
  db: D1Database,
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  removeVectors: DeleteChunkVectors,
): Promise<void> {
  const chunkRows = await db
    .prepare(
      `SELECT document_id, chunk_index FROM chunks WHERE knowledge_source_id = ?`,
    )
    .bind(knowledgeSourceId)
    .all<{ document_id: string; chunk_index: number }>();

  const vectorIds = await vectorIdsForChunks(
    knowledgeSourceId,
    chunkRows.results ?? [],
  );
  if (vectorIds.length > 0) {
    await removeVectors(vectorize, vectorIds);
  }
}

/**
 * Deletes a connection: read all linked sources (ORDER BY id), purge every source's
 * vectors, then delete all source rows and the connection row in one D1 batch. Vector-first
 * ordering allows retry if Vectorize fails without partial D1 deletes.
 */
export async function deleteConnection(
  db: D1Database,
  vectorize: VectorizeIndex,
  connectionId: string,
  options: DeleteConnectionOptions = {},
): Promise<void> {
  const connection = await getConnectionById(db, connectionId);
  if (connection === null) {
    return;
  }

  const removeVectors = options.deleteChunkVectors ?? deleteChunkVectors;

  const sourceRows = await db
    .prepare(`SELECT id FROM knowledge_sources WHERE connection_id = ? ORDER BY id`)
    .bind(connectionId)
    .all<{ id: string }>();

  const sourceIds = (sourceRows.results ?? []).map((row) => row.id);

  // A source added after this read but before batch would cascade on connection delete without vector purge.

  for (const sourceId of sourceIds) {
    await purgeKnowledgeSourceVectors(db, vectorize, sourceId, removeVectors);
  }

  if (sourceIds.length === 0) {
    await deleteConnectionById(db, connectionId);
    return;
  }

  const statements = [
    ...sourceIds.map((sourceId) =>
      db.prepare("DELETE FROM knowledge_sources WHERE id = ?").bind(sourceId),
    ),
    db.prepare("DELETE FROM connections WHERE id = ?").bind(connectionId),
  ];
  await db.batch(statements);
}
