import { deleteConnectionById } from "../db/connections.js";
import {
  deleteKnowledgeSource,
  type DeleteKnowledgeSourceOptions,
} from "../knowledge-sources/delete.js";

export type DeleteConnectionOptions = DeleteKnowledgeSourceOptions;

/**
 * Deletes a connection: deleteKnowledgeSource for each linked source (vectors then row),
 * then the connection row. Vector-first ordering allows retry if Vectorize fails.
 */
export async function deleteConnection(
  db: D1Database,
  vectorize: VectorizeIndex,
  connectionId: string,
  options: DeleteConnectionOptions = {},
): Promise<void> {
  const sourceRows = await db
    .prepare(`SELECT id, user_id FROM knowledge_sources WHERE connection_id = ?`)
    .bind(connectionId)
    .all<{ id: string; user_id: string | null }>();

  for (const row of sourceRows.results ?? []) {
    if (row.user_id === null) {
      throw new Error(`Knowledge source ${row.id} has no owner user_id`);
    }

    const deleted = await deleteKnowledgeSource(
      db,
      vectorize,
      row.id,
      row.user_id,
      options,
    );
    if (!deleted) {
      throw new Error(`Failed to delete knowledge source ${row.id}`);
    }
  }

  await deleteConnectionById(db, connectionId);
}
