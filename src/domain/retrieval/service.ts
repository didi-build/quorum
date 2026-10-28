import type { QuorumConfig } from "../../config/types.js";
import {
  VoyageEmbedError,
  embedQuery,
  type VoyageFetch,
} from "../ingestion/embedder.js";
import type { ActorContext } from "../schemas/actor.js";
import type { RetrievalResponse, RetrievedChunk } from "../schemas/retrieval.js";
import { RETRIEVAL_EXPANSION_CAP } from "../schemas/retrieval.js";
import { type ChunkRow } from "./chunk-rows.js";
import { coverageCheck } from "./coverage.js";
import { RetrievalUpstreamError } from "./errors.js";
import { searchChunksByKeyword } from "./keyword-search.js";
import { reciprocalRankFusion, type RankedResult, type RrfFusedRow } from "./rrf.js";
import { searchChunksByVector } from "./vector-search.js";

export { RETRIEVAL_EXPANSION_CAP };

export interface RetrieveParams {
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  query: string;
  actor: ActorContext;
  effectiveProjectId: string | null;
  topK?: number | null;
}

export interface RetrievalSearchDeps {
  voyageFetch?: VoyageFetch;
  searchVector?: typeof searchChunksByVector;
  searchKeyword?: typeof searchChunksByKeyword;
}

export async function accessibleReadySourceIds(
  db: D1Database,
  actorUserId: string,
  actorProjectId: string | null,
): Promise<string[]> {
  const sql = `
    SELECT id FROM knowledge_sources
    WHERE status = 'ready'
    AND (
      (user_id IS NULL AND project_id IS NULL)
      OR (user_id = ?1 AND project_id IS NULL)
      OR (?2 IS NOT NULL AND user_id IS NULL AND project_id = ?2)
      OR (?2 IS NOT NULL AND user_id = ?1 AND project_id = ?2)
    )
  `;

  const { results } = await db
    .prepare(sql)
    .bind(actorUserId, actorProjectId)
    .all<{ id: string }>();

  return (results ?? []).map((row) => row.id);
}

function rankedFromRows(rows: ChunkRow[]): RankedResult[] {
  return rows.map((row, index) => ({ chunkId: row.id, rank: index + 1 }));
}

function buildRowLookup(
  vectorRows: ChunkRow[],
  keywordRows: ChunkRow[],
): Map<number, ChunkRow> {
  const lookup = new Map<number, ChunkRow>();
  for (const row of vectorRows) {
    lookup.set(row.id, row);
  }
  for (const row of keywordRows) {
    lookup.set(row.id, row);
  }
  return lookup;
}

function fusedTexts(
  fused: RrfFusedRow[],
  resultLimit: number,
  rowLookup: Map<number, ChunkRow>,
): string[] {
  const texts: string[] = [];
  for (const [chunkId, ,] of fused.slice(0, resultLimit)) {
    if (typeof chunkId !== "number") {
      continue;
    }
    const row = rowLookup.get(chunkId);
    if (row) {
      texts.push(row.content);
    }
  }
  return texts;
}

async function hybridSearch(
  deps: Required<Pick<RetrievalSearchDeps, "searchVector" | "searchKeyword">> &
    RetrievalSearchDeps,
  params: {
    db: D1Database;
    vectorize: VectorizeIndex;
    config: QuorumConfig;
    query: string;
    sourceIds: string[];
    queryEmbedding: number[];
    limit: number;
  },
): Promise<{
  fused: RrfFusedRow[];
  rowLookup: Map<number, ChunkRow>;
}> {
  const searchVector = deps.searchVector ?? searchChunksByVector;
  const searchKeyword = deps.searchKeyword ?? searchChunksByKeyword;

  const [vectorRows, keywordRows] = await Promise.all([
    searchVector(
      params.vectorize,
      params.db,
      params.sourceIds,
      params.queryEmbedding,
      params.limit,
    ),
    searchKeyword(params.db, params.sourceIds, params.query, params.limit),
  ]);

  const vectorRanked = rankedFromRows(vectorRows);
  const keywordRanked = rankedFromRows(keywordRows);
  const fused = reciprocalRankFusion([vectorRanked, keywordRanked], params.config.rrfK);
  const rowLookup = buildRowLookup(vectorRows, keywordRows);

  return { fused, rowLookup };
}

function buildRetrievedChunks(
  fused: RrfFusedRow[],
  limit: number,
  rowLookup: Map<number, ChunkRow>,
  allowedSourceIds: ReadonlySet<string>,
): RetrievedChunk[] {
  const chunks: RetrievedChunk[] = [];

  for (const [chunkId, score, rankMeta] of fused.slice(0, limit)) {
    if (typeof chunkId !== "number") {
      continue;
    }
    const row = rowLookup.get(chunkId);
    if (!row || !allowedSourceIds.has(row.knowledge_source_id)) {
      continue;
    }

    chunks.push({
      chunk_id: row.id,
      knowledge_source_id: row.knowledge_source_id,
      document_id: row.document_id,
      chunk_index: row.chunk_index,
      content: row.content,
      heading_hierarchy: row.heading_hierarchy,
      rrf_score: score,
      vector_rank: rankMeta.vector_rank,
      keyword_rank: rankMeta.keyword_rank,
    });
  }

  return chunks;
}

export async function retrieve(
  params: RetrieveParams,
  deps: RetrievalSearchDeps = {},
): Promise<RetrievalResponse> {
  const { db, vectorize, config, query, actor, effectiveProjectId } = params;
  const limit = params.topK ?? config.retrievalTopK;

  const sourceIds = await accessibleReadySourceIds(
    db,
    actor.userId,
    effectiveProjectId,
  );
  if (sourceIds.length === 0) {
    const coverage = coverageCheck(query, [], config.coverageMinScore);
    return {
      query,
      chunks: [],
      coverage_sufficient: coverage.sufficient,
      coverage_score: coverage.score,
      expanded: false,
    };
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(config, query, deps.voyageFetch);
  } catch (error) {
    if (error instanceof VoyageEmbedError) {
      throw new RetrievalUpstreamError(502);
    }
    throw error;
  }

  const searchDeps = {
    ...deps,
    searchVector: deps.searchVector ?? searchChunksByVector,
    searchKeyword: deps.searchKeyword ?? searchChunksByKeyword,
  };

  let { fused, rowLookup } = await hybridSearch(searchDeps, {
    db,
    vectorize,
    config,
    query,
    sourceIds,
    queryEmbedding,
    limit,
  });

  let coverage = coverageCheck(
    query,
    fusedTexts(fused, limit, rowLookup),
    config.coverageMinScore,
  );
  let expanded = false;

  if (!coverage.sufficient && limit < RETRIEVAL_EXPANSION_CAP) {
    expanded = true;
    const expandedLimit = Math.min(limit * 2, RETRIEVAL_EXPANSION_CAP);
    ({ fused, rowLookup } = await hybridSearch(searchDeps, {
      db,
      vectorize,
      config,
      query,
      sourceIds,
      queryEmbedding,
      limit: expandedLimit,
    }));
    coverage = coverageCheck(
      query,
      fusedTexts(fused, expandedLimit, rowLookup),
      config.coverageMinScore,
    );
  }

  const chunks = buildRetrievedChunks(fused, limit, rowLookup, new Set(sourceIds));

  return {
    query,
    chunks,
    coverage_sufficient: coverage.sufficient,
    coverage_score: coverage.score,
    expanded,
  };
}
