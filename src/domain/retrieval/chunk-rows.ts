export interface ChunkRow {
  id: number;
  knowledge_source_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading_hierarchy: string[];
}

export interface ChunkRowRaw {
  id: number;
  knowledge_source_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  heading_hierarchy: string;
}

export function parseChunkRow(row: ChunkRowRaw): ChunkRow {
  let heading: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.heading_hierarchy);
    if (Array.isArray(parsed)) {
      heading = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    heading = [];
  }
  return {
    id: row.id,
    knowledge_source_id: row.knowledge_source_id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    heading_hierarchy: heading,
  };
}

export function parseChunkRows(rows: ChunkRowRaw[] | undefined): ChunkRow[] {
  return (rows ?? []).map(parseChunkRow);
}

export async function loadChunksByIdsInOrder(
  db: D1Database,
  ids: number[],
  allowedSourceIds: ReadonlySet<string>,
): Promise<ChunkRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
       FROM chunks WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<ChunkRowRaw>();

  const byId = new Map<number, ChunkRow>();
  for (const row of parseChunkRows(results)) {
    if (allowedSourceIds.has(row.knowledge_source_id)) {
      byId.set(row.id, row);
    }
  }

  const ordered: ChunkRow[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) {
      ordered.push(row);
    }
  }
  return ordered;
}
