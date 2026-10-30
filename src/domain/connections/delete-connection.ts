import { deleteConnectionById, getConnectionById } from "../db/connections.js";
import {
  deleteKnowledgeSource,
  purgeKnowledgeSource,
  type DeleteKnowledgeSourceOptions,
} from "../knowledge-sources/delete.js";

export type DeleteConnectionOptions = DeleteKnowledgeSourceOptions;

/**
 * Deletes a connection: purge NULL-owner (shared) sources, deleteKnowledgeSource for
 * connection-owner sources (vectors then row), then the connection row. Vector-first
 * ordering allows retry if Vectorize fails.
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

  const env = { DB: db, VECTORIZE: vectorize };
  const connectionOwnerId = connection.user_id;

  const sourceRows = await db
    .prepare(`SELECT id, user_id FROM knowledge_sources WHERE connection_id = ?`)
    .bind(connectionId)
    .all<{ id: string; user_id: string | null }>();

  for (const row of sourceRows.results ?? []) {
    if (row.user_id === null) {
      await purgeKnowledgeSource(env, row.id, options);
      continue;
    }

    const deleted = await deleteKnowledgeSource(
      db,
      vectorize,
      row.id,
      connectionOwnerId,
      options,
    );
    if (!deleted) {
      throw new Error(`Failed to delete knowledge source ${row.id}`);
    }
  }

  await deleteConnectionById(db, connectionId);
}
