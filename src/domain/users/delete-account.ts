import {
  purgeKnowledgeSource,
  type DeleteKnowledgeSourceOptions,
} from "../knowledge-sources/delete.js";

export type DeleteUserAccountOptions = DeleteKnowledgeSourceOptions;

/**
 * Deletes a user account: purge each selected knowledge source (vectors then row), delete
 * connections, then the users row last (remaining owned D1 rows cascade). Vector-first ordering
 * allows retry if Vectorize fails.
 */
export async function deleteUserAccount(
  db: D1Database,
  vectorize: VectorizeIndex,
  userId: string,
  options: DeleteUserAccountOptions = {},
): Promise<void> {
  const env = { DB: db, VECTORIZE: vectorize };

  const sourceRows = await db
    .prepare(
      `SELECT id FROM knowledge_sources
       WHERE user_id = ?
          OR connection_id IN (SELECT id FROM connections WHERE user_id = ?)`,
    )
    .bind(userId, userId)
    .all<{ id: string }>();

  for (const row of sourceRows.results ?? []) {
    await purgeKnowledgeSource(env, row.id, options);
  }

  await db.prepare("DELETE FROM connections WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
