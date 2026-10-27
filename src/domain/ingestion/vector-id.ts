/** Vectorize vector id max length (bytes). */
export const CHUNK_VECTOR_ID_MAX_BYTES = 64;

/** Pinned format: lowercase hex SHA-256 of the namespaced key string. */
export const CHUNK_VECTOR_ID_FORMAT = "sha256-hex-namespaced-key";

export function chunkVectorIdInput(
  knowledgeSourceId: string,
  documentId: string,
  chunkIndex: number,
): string {
  return `${knowledgeSourceId}:${documentId}:${chunkIndex}`;
}

function bytesToHexLower(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let hex = "";
  for (const byte of view) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function chunkVectorId(
  knowledgeSourceId: string,
  documentId: string,
  chunkIndex: number,
): Promise<string> {
  const input = chunkVectorIdInput(knowledgeSourceId, documentId, chunkIndex);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const id = bytesToHexLower(digest);
  if (id.length !== CHUNK_VECTOR_ID_MAX_BYTES) {
    throw new Error("chunk vector id must be 64 hex characters");
  }
  return id;
}

export async function vectorIdsForChunks(
  knowledgeSourceId: string,
  rows: ReadonlyArray<{ document_id: string; chunk_index: number }>,
): Promise<string[]> {
  return await Promise.all(
    rows.map((row) =>
      chunkVectorId(knowledgeSourceId, row.document_id, row.chunk_index),
    ),
  );
}
