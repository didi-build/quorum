import type { QuorumConfig } from "../config/types.js";
import { retrieve } from "../domain/retrieval/service.js";
import { RetrievalUpstreamError } from "../domain/retrieval/errors.js";
import { resolveRetrievalProjectScope } from "../domain/retrieval/project-scope.js";
import { RETRIEVAL_QUERY_MAX_LENGTH } from "../domain/retrieval/query-limits.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { RetrievalRequestBody } from "../domain/schemas/retrieval.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

function parseRetrievalRequest(body: unknown): RetrievalRequestBody | Response {
  if (body === null || typeof body !== "object") {
    return jsonDetail("Invalid JSON body", 400);
  }
  const record = body as Record<string, unknown>;
  const query = record.query;
  if (typeof query !== "string" || query.length < 1) {
    return jsonDetail("query is required", 400);
  }
  if (query.length > RETRIEVAL_QUERY_MAX_LENGTH) {
    return jsonDetail(
      `query must be at most ${RETRIEVAL_QUERY_MAX_LENGTH} characters`,
      400,
    );
  }

  let projectId: string | null | undefined;
  if ("project_id" in record) {
    const value = record.project_id;
    if (value !== null && value !== undefined && typeof value !== "string") {
      return jsonDetail("project_id must be a string or null", 400);
    }
    projectId = value as string | null | undefined;
  }

  let topK: number | null | undefined;
  if ("top_k" in record) {
    const value = record.top_k;
    if (value !== null && value !== undefined) {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 50
      ) {
        return jsonDetail("top_k must be an integer between 1 and 50", 400);
      }
      topK = value;
    }
  }

  return { query, project_id: projectId, top_k: topK };
}

export async function handleRetrievalRoute(
  request: Request,
  env: Env,
  config: QuorumConfig,
  pathname: string,
  actor: ActorContext,
): Promise<Response | null> {
  if (pathname !== "/retrieval/query" || request.method !== "POST") {
    return null;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonDetail("Invalid JSON body", 400);
  }

  const parsed = parseRetrievalRequest(body);
  if (parsed instanceof Response) {
    return parsed;
  }

  const scope = resolveRetrievalProjectScope(actor, parsed.project_id);
  if (!scope.ok) {
    return jsonDetail(scope.detail, scope.status);
  }

  try {
    const response = await retrieve({
      db: env.DB,
      vectorize: env.VECTORIZE,
      config,
      query: parsed.query,
      actor,
      effectiveProjectId: scope.effectiveProjectId,
      topK: parsed.top_k,
    });

    return Response.json(response);
  } catch (error) {
    if (error instanceof RetrievalUpstreamError) {
      return jsonDetail("Retrieval upstream unavailable", error.statusCode);
    }
    throw error;
  }
}

export { parseRetrievalRequest };
