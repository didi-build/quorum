import type { QuorumConfig } from "../../config/types.js";
import type { ConnectionRow } from "../db/connections.js";
import { getConnectionById } from "../db/connections.js";
import { getLinearAccessToken } from "../oauth/linear.js";
import { fetchGithubRepoDocuments } from "./adapters/github.js";
import { fetchLinearTeamDocuments } from "./adapters/linear.js";
import type { FetchedDocument } from "./adapters/types.js";
import { chunkText } from "./chunking.js";
import { clearSourceIndex } from "./clear-source-index.js";
import { VECTORIZE_UPSERT_BATCH_SIZE } from "./constants.js";
import { embedChunksFlat, type VoyageFetch } from "./embedder.js";
import { indexingErrorMessage } from "./errors.js";
import type { IndexingQueueMessage } from "./indexing-message.js";
import { indexingErrorLogFields, isIndexingTemporaryError } from "./indexing-retry.js";
import { resolveIndexingRun, withIndexingRunId } from "./indexing-run.js";
import { chunkVectorId } from "./vector-id.js";

export type GithubDocumentsFetcher = (
  config: QuorumConfig,
  installationId: string,
  repoFullName: string,
  options: { filesAlreadyProcessed?: number; fetchImpl?: typeof fetch },
) => Promise<{
  documents: FetchedDocument[];
  has_more: boolean;
  files_processed: number;
}>;

export type LinearDocumentsFetcher = (
  accessToken: string,
  teamId: string,
  fetchImpl?: typeof fetch,
) => Promise<FetchedDocument[]>;

export type UpsertChunkVectors = (
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  rows: Array<{
    chunk_rowid: number;
    document_id: string;
    chunk_index: number;
    embedding: number[];
  }>,
) => Promise<void>;

export interface IndexKnowledgeSourceDeps {
  fetchGithubRepoDocuments?: GithubDocumentsFetcher;
  fetchLinearTeamDocuments?: LinearDocumentsFetcher;
  providerFetch?: typeof fetch;
  voyageFetch?: VoyageFetch;
  clearSourceIndex?: typeof clearSourceIndex;
  upsertChunkVectors?: UpsertChunkVectors;
}

interface KnowledgeSourceRow {
  id: string;
  source_type: "github_repo" | "linear";
  external_ref: string;
  connection_id: string;
  indexing_run_id: string | null;
  status: string;
}

async function loadKnowledgeSource(
  db: D1Database,
  sourceId: string,
): Promise<KnowledgeSourceRow | null> {
  return await db
    .prepare(
      `SELECT id, source_type, external_ref, connection_id, indexing_run_id, status
       FROM knowledge_sources WHERE id = ?`,
    )
    .bind(sourceId)
    .first<KnowledgeSourceRow>();
}

async function setIndexingRunId(
  db: D1Database,
  sourceId: string,
  runId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE knowledge_sources SET indexing_run_id = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(runId, now, sourceId)
    .run();
}

async function setSourceStatus(
  db: D1Database,
  sourceId: string,
  status: string,
  statusMessage: string | null,
  lastIndexedAt?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE knowledge_sources
       SET status = ?, status_message = ?, last_indexed_at = COALESCE(?, last_indexed_at), updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, statusMessage, lastIndexedAt ?? null, now, sourceId)
    .run();
}

export async function markKnowledgeSourceIndexingError(
  db: D1Database,
  sourceId: string,
  statusMessage: string,
): Promise<void> {
  const source = await loadKnowledgeSource(db, sourceId);
  if (source === null) {
    return;
  }
  await setSourceStatus(db, sourceId, "error", statusMessage);
}

export async function upsertVectors(
  vectorize: VectorizeIndex,
  knowledgeSourceId: string,
  rows: Array<{
    chunk_rowid: number;
    document_id: string;
    chunk_index: number;
    embedding: number[];
  }>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += VECTORIZE_UPSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + VECTORIZE_UPSERT_BATCH_SIZE);
    const vectors = await Promise.all(
      batch.map(async (row) => ({
        id: await chunkVectorId(knowledgeSourceId, row.document_id, row.chunk_index),
        values: row.embedding,
        metadata: {
          knowledge_source_id: knowledgeSourceId,
          document_id: row.document_id,
          chunk_index: row.chunk_index,
          chunk_rowid: row.chunk_rowid,
        },
      })),
    );
    await vectorize.upsert(vectors);
  }
}

async function upsertChunkRow(
  db: D1Database,
  sourceId: string,
  chunk: {
    document_id: string;
    chunk_index: number;
    content: string;
    heading_hierarchy: string[];
  },
): Promise<number> {
  const headingJson = JSON.stringify(chunk.heading_hierarchy);
  await db
    .prepare(
      `INSERT INTO chunks (
        knowledge_source_id, document_id, chunk_index, content, heading_hierarchy
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(knowledge_source_id, document_id, chunk_index)
      DO UPDATE SET
        content = excluded.content,
        heading_hierarchy = excluded.heading_hierarchy`,
    )
    .bind(sourceId, chunk.document_id, chunk.chunk_index, chunk.content, headingJson)
    .run();

  const row = await db
    .prepare(
      `SELECT id FROM chunks
       WHERE knowledge_source_id = ? AND document_id = ? AND chunk_index = ?`,
    )
    .bind(sourceId, chunk.document_id, chunk.chunk_index)
    .first<{ id: number }>();
  if (!row) {
    throw new Error("Failed to load chunk row after upsert");
  }
  return row.id;
}

export interface IndexKnowledgeSourceResult {
  done: boolean;
  continuation: IndexingQueueMessage | null;
  /** True when the message run id is not the source's current run (late redelivery). */
  stale?: boolean;
}

export async function indexKnowledgeSource(
  db: D1Database,
  vectorize: VectorizeIndex,
  config: QuorumConfig,
  message: IndexingQueueMessage,
  deps: IndexKnowledgeSourceDeps = {},
): Promise<IndexKnowledgeSourceResult> {
  const sourceId = message.source_id;
  const filesAlreadyProcessed = message.github_files_processed ?? 0;
  const isFreshRun = filesAlreadyProcessed === 0;

  const source = await loadKnowledgeSource(db, sourceId);
  if (source === null) {
    return { done: true, continuation: null };
  }

  const runResolution = resolveIndexingRun(message, source, isFreshRun);
  if (runResolution.stale) {
    return { done: true, continuation: null, stale: true };
  }
  const runId = runResolution.runId;
  if (runId === null) {
    return { done: true, continuation: null, stale: true };
  }

  if (source.indexing_run_id !== runId) {
    await setIndexingRunId(db, sourceId, runId);
  }

  const connection = await getConnectionById(db, source.connection_id);
  if (connection === null) {
    await setSourceStatus(db, sourceId, "error", "Connection not found");
    return { done: true, continuation: null };
  }

  const clearIndex = deps.clearSourceIndex ?? clearSourceIndex;
  const upsertVectorsImpl = deps.upsertChunkVectors ?? upsertVectors;
  const githubFetch = deps.fetchGithubRepoDocuments ?? fetchGithubRepoDocuments;
  const linearFetch = deps.fetchLinearTeamDocuments ?? fetchLinearTeamDocuments;
  const providerFetch = deps.providerFetch ?? fetch;
  const voyageFetch = deps.voyageFetch ?? fetch;

  if (isFreshRun) {
    await setSourceStatus(db, sourceId, "indexing", "Indexing in progress");
  }

  try {
    let documents: FetchedDocument[] = [];
    let githubHasMore = false;
    let githubFilesProcessed = filesAlreadyProcessed;

    if (source.source_type === "github_repo") {
      if (!connection.installation_id) {
        throw new Error("GitHub connection is missing installation_id");
      }
      const result = await githubFetch(
        config,
        connection.installation_id,
        source.external_ref,
        { filesAlreadyProcessed, fetchImpl: providerFetch },
      );
      documents = result.documents;
      githubHasMore = result.has_more;
      githubFilesProcessed = result.files_processed;
    } else if (source.source_type === "linear") {
      if (filesAlreadyProcessed > 0) {
        return { done: true, continuation: null };
      }
      const accessToken = await getLinearAccessToken(
        db,
        config,
        connection as ConnectionRow,
        providerFetch,
      );
      documents = await linearFetch(accessToken, source.external_ref, providerFetch);
    } else {
      throw new Error(`Unsupported source type: ${source.source_type}`);
    }

    const flatChunks = documents.flatMap((document) =>
      chunkText(document.document_id, document.content, config).map((chunk) => ({
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        heading_hierarchy: chunk.heading_hierarchy,
      })),
    );

    const indexingComplete = !githubHasMore;

    if (flatChunks.length === 0 && indexingComplete) {
      if (isFreshRun) {
        await clearIndex(db, vectorize, sourceId);
      }
      const now = new Date().toISOString();
      const messageText = isFreshRun ? "No indexable content found" : null;
      await setSourceStatus(db, sourceId, "ready", messageText, now);
      return { done: true, continuation: null };
    }

    if (flatChunks.length === 0 && githubHasMore) {
      if (isFreshRun) {
        await clearIndex(db, vectorize, sourceId);
      }
      return {
        done: false,
        continuation: withIndexingRunId(
          {
            source_id: sourceId,
            github_files_processed: githubFilesProcessed,
          },
          runId,
        ),
      };
    }

    const embeddings = await embedChunksFlat(config, flatChunks, voyageFetch);

    if (isFreshRun) {
      await clearIndex(db, vectorize, sourceId);
    }

    const vectorRows: Array<{
      chunk_rowid: number;
      document_id: string;
      chunk_index: number;
      embedding: number[];
    }> = [];

    for (let i = 0; i < flatChunks.length; i++) {
      const chunk = flatChunks[i];
      const chunkRowid = await upsertChunkRow(db, sourceId, chunk);
      vectorRows.push({
        chunk_rowid: chunkRowid,
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        embedding: embeddings[i],
      });
    }

    await upsertVectorsImpl(vectorize, sourceId, vectorRows);

    if (githubHasMore) {
      return {
        done: false,
        continuation: withIndexingRunId(
          {
            source_id: sourceId,
            github_files_processed: githubFilesProcessed,
          },
          runId,
        ),
      };
    }

    const now = new Date().toISOString();
    await setSourceStatus(db, sourceId, "ready", null, now);
    return { done: true, continuation: null };
  } catch (error) {
    if (isIndexingTemporaryError(error)) {
      console.error("Indexing temporary failure", {
        source_id: sourceId,
        ...indexingErrorLogFields(error),
      });
      throw error;
    }
    console.error("Indexing permanent failure", {
      source_id: sourceId,
      ...indexingErrorLogFields(error),
    });
    await setSourceStatus(db, sourceId, "error", indexingErrorMessage(error));
    return { done: true, continuation: null };
  }
}
