import { parseChunkRows, type ChunkRow, type ChunkRowRaw } from "./chunk-rows.js";

/** Build an FTS5 MATCH string with AND between significant terms (plainto_tsquery-like). */
export function buildFtsMatchQuery(query: string): string | null {
  const tokens = query.match(/[a-zA-Z0-9_]+/g) ?? [];
  const terms = tokens.filter((token) => token.length > 2);
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" AND ");
}

export async function searchChunksByKeyword(
  db: D1Database,
  sourceIds: string[],
  query: string,
  limit: number,
): Promise<ChunkRow[]> {
  if (sourceIds.length === 0 || limit <= 0) {
    return [];
  }

  const match = buildFtsMatchQuery(query);
  if (match === null) {
    return [];
  }

  const sourcePlaceholders = sourceIds.map(() => "?").join(",");
  const sql = `
    SELECT c.id, c.knowledge_source_id, c.document_id, c.chunk_index, c.content, c.heading_hierarchy
    FROM chunks_fts
    INNER JOIN chunks c ON c.id = chunks_fts.rowid
    WHERE c.knowledge_source_id IN (${sourcePlaceholders})
      AND chunks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `;

  const { results } = await db
    .prepare(sql)
    .bind(...sourceIds, match, limit)
    .all<ChunkRowRaw>();

  return parseChunkRows(results);
}
