import type { QuorumConfig } from "../../config/types.js";
import { EMBEDDING_BATCH_SIZE } from "./constants.js";

export type VoyageFetch = typeof fetch;

export interface ContextualizedEmbeddingItem {
  embedding: number[];
  index: number;
}

export interface ContextualizedEmbeddingDocument {
  data: ContextualizedEmbeddingItem[];
  index: number;
}

export interface ContextualizedEmbeddingResponse {
  data: ContextualizedEmbeddingDocument[];
  model: string;
}

const DEFAULT_VOYAGE_BASE = "https://api.voyageai.com/v1";

function voyageBaseUrl(config: QuorumConfig): string {
  const raw = config.voyageBaseUrl.trim();
  if (!raw) {
    return DEFAULT_VOYAGE_BASE;
  }
  return raw.replace(/\/$/, "");
}

export class VoyageEmbedError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message = "Voyage embedding request failed") {
    super(message);
    this.name = "VoyageEmbedError";
    this.statusCode = statusCode;
  }
}

/**
 * Embeds pre-chunked documents via Voyage contextualized embeddings (voyage-context-4).
 * Each inner list is one document's chunks in order.
 */
export async function embedDocumentChunkGroups(
  config: QuorumConfig,
  chunkGroups: string[][],
  fetchImpl: VoyageFetch = fetch,
): Promise<number[][]> {
  if (chunkGroups.length === 0) {
    return [];
  }

  const url = `${voyageBaseUrl(config)}/contextualizedembeddings`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.voyageModel,
      input_type: "document",
      inputs: chunkGroups,
      output_dimension: config.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    throw new VoyageEmbedError(response.status);
  }

  const payload = (await response.json()) as ContextualizedEmbeddingResponse;
  const vectors: number[][] = [];
  for (const document of payload.data) {
    const sorted = [...document.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      vectors.push(item.embedding);
    }
  }
  return vectors;
}

export async function embedQuery(
  config: QuorumConfig,
  text: string,
  fetchImpl: VoyageFetch = fetch,
): Promise<number[]> {
  const url = `${voyageBaseUrl(config)}/contextualizedembeddings`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.voyageModel,
      input_type: "query",
      inputs: [[text]],
      output_dimension: config.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    throw new VoyageEmbedError(response.status);
  }

  const payload = (await response.json()) as ContextualizedEmbeddingResponse;
  const first = payload.data[0]?.data[0];
  if (!first) {
    throw new VoyageEmbedError(502, "Voyage returned no query embedding");
  }
  return first.embedding;
}

export interface FlatChunkForEmbedding {
  document_id: string;
  chunk_index: number;
  content: string;
}

function groupBatchByDocument(batch: FlatChunkForEmbedding[]): string[][] {
  const groups: string[][] = [];
  let currentDoc: string | null = null;
  let current: string[] = [];
  for (const chunk of batch) {
    if (currentDoc !== null && chunk.document_id !== currentDoc) {
      groups.push(current);
      current = [];
    }
    currentDoc = chunk.document_id;
    current.push(chunk.content);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/** Embeds a flat chunk list, returning one vector per chunk in the same order. */
export async function embedChunksFlat(
  config: QuorumConfig,
  chunks: FlatChunkForEmbedding[],
  fetchImpl: VoyageFetch = fetch,
): Promise<number[][]> {
  const allVectors: number[][] = [];
  for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const groups = groupBatchByDocument(batch);
    const vectors = await embedDocumentChunkGroups(config, groups, fetchImpl);
    if (vectors.length !== batch.length) {
      throw new VoyageEmbedError(502, "Voyage returned unexpected embedding count");
    }
    allVectors.push(...vectors);
  }
  return allVectors;
}
