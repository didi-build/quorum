import type { QuorumConfig } from "../config/types.js";
import { getConnectionById } from "../domain/db/connections.js";
import {
  getKnowledgeSourceRowById,
  insertKnowledgeSource,
  knowledgeSourceRowToRead,
  listKnowledgeSourceRows,
  markKnowledgeSourceQueuedForReindex,
} from "../domain/db/knowledge-sources.js";
import { enqueueKnowledgeSourceIndexing } from "../domain/knowledge-sources/enqueue-indexing.js";
import { deleteKnowledgeSource } from "../domain/knowledge-sources/delete.js";
import { sourceTypeMismatchDetail } from "../domain/knowledge-sources/validate-source-type.js";
import { can_access } from "../domain/permissions.js";
import { resolveRetrievalProjectScope } from "../domain/retrieval/project-scope.js";
import { isRetrievalProjectUuid } from "../domain/retrieval/query-limits.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type {
  KnowledgeSourceCreate,
  KnowledgeSourceListResponse,
  SourceType,
} from "../domain/schemas/sources.js";
import type { Env } from "../env.js";
import { jsonDetail } from "../http/api-error.js";

const SOURCE_TYPES = new Set<SourceType>(["github_repo", "linear"]);

function connectionNotFound(): Response {
  return jsonDetail("Connection not found", 404);
}

function knowledgeSourceNotFound(): Response {
  return jsonDetail("Knowledge source not found", 404);
}

function actorCanAccessSource(
  actor: ActorContext,
  row: { user_id: string | null; project_id: string | null },
): boolean {
  return can_access(actor.userId, actor.projectId, row.user_id, row.project_id);
}

function parseKnowledgeSourceCreate(body: unknown): KnowledgeSourceCreate | Response {
  if (body === null || typeof body !== "object") {
    return jsonDetail("Invalid JSON body", 400);
  }
  const record = body as Record<string, unknown>;

  const name = record.name;
  if (typeof name !== "string" || name.length < 1 || name.length > 255) {
    return jsonDetail("name must be a string between 1 and 255 characters", 400);
  }

  const sourceType = record.source_type;
  if (typeof sourceType !== "string" || !SOURCE_TYPES.has(sourceType as SourceType)) {
    return jsonDetail("source_type must be github_repo or linear", 400);
  }

  const externalRef = record.external_ref;
  if (
    typeof externalRef !== "string" ||
    externalRef.length < 1 ||
    externalRef.length > 512
  ) {
    return jsonDetail(
      "external_ref must be a string between 1 and 512 characters",
      400,
    );
  }

  const connectionId = record.connection_id;
  if (typeof connectionId !== "string" || !isRetrievalProjectUuid(connectionId)) {
    return jsonDetail("connection_id must be a UUID", 400);
  }

  let projectId: string | null | undefined;
  if ("project_id" in record) {
    const value = record.project_id;
    if (value !== null && value !== undefined && typeof value !== "string") {
      return jsonDetail("project_id must be a string or null", 400);
    }
    projectId = value as string | null | undefined;
  }

  return {
    name,
    source_type: sourceType as SourceType,
    external_ref: externalRef,
    connection_id: connectionId,
    project_id: projectId,
  };
}

async function handleListSources(env: Env, actor: ActorContext): Promise<Response> {
  const rows = await listKnowledgeSourceRows(env.DB);
  const sources = rows
    .filter((row) => actorCanAccessSource(actor, row))
    .map(knowledgeSourceRowToRead);
  const body: KnowledgeSourceListResponse = { sources };
  return Response.json(body);
}

async function handleCreateSource(
  request: Request,
  env: Env,
  actor: ActorContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonDetail("Invalid JSON body", 400);
  }

  const parsed = parseKnowledgeSourceCreate(body);
  if (parsed instanceof Response) {
    return parsed;
  }

  const connection = await getConnectionById(env.DB, parsed.connection_id);
  if (
    connection === null ||
    !can_access(actor.userId, actor.projectId, connection.user_id, null)
  ) {
    return connectionNotFound();
  }

  const scope = resolveRetrievalProjectScope(actor, parsed.project_id);
  if (!scope.ok) {
    return jsonDetail(scope.detail, scope.status);
  }

  const mismatch = sourceTypeMismatchDetail(parsed.source_type, connection.provider);
  if (mismatch !== null) {
    return jsonDetail(mismatch, 400);
  }

  const sourceId = crypto.randomUUID();
  const row = await insertKnowledgeSource(env.DB, {
    id: sourceId,
    userId: actor.userId,
    projectId: scope.effectiveProjectId,
    sourceType: parsed.source_type,
    externalRef: parsed.external_ref,
    connectionId: parsed.connection_id,
    name: parsed.name,
  });

  await enqueueKnowledgeSourceIndexing(env.INDEXING_QUEUE, sourceId);

  return Response.json(knowledgeSourceRowToRead(row), { status: 201 });
}

async function handleGetSource(
  env: Env,
  actor: ActorContext,
  sourceId: string,
): Promise<Response> {
  const row = await getKnowledgeSourceRowById(env.DB, sourceId);
  if (row === null || !actorCanAccessSource(actor, row)) {
    return knowledgeSourceNotFound();
  }
  return Response.json(knowledgeSourceRowToRead(row));
}

async function handleDeleteSource(
  env: Env,
  actor: ActorContext,
  sourceId: string,
): Promise<Response> {
  const row = await getKnowledgeSourceRowById(env.DB, sourceId);
  if (row === null || !actorCanAccessSource(actor, row)) {
    return knowledgeSourceNotFound();
  }

  await deleteKnowledgeSource(env.DB, env.VECTORIZE, sourceId);
  return new Response(null, { status: 204 });
}

async function handleRefreshSource(
  env: Env,
  actor: ActorContext,
  sourceId: string,
): Promise<Response> {
  const row = await getKnowledgeSourceRowById(env.DB, sourceId);
  if (row === null || !actorCanAccessSource(actor, row)) {
    return knowledgeSourceNotFound();
  }

  const updated = await markKnowledgeSourceQueuedForReindex(env.DB, sourceId);
  if (updated === null) {
    return knowledgeSourceNotFound();
  }

  await enqueueKnowledgeSourceIndexing(env.INDEXING_QUEUE, sourceId);
  return Response.json(knowledgeSourceRowToRead(updated));
}

export async function handleSourcesRoute(
  request: Request,
  env: Env,
  _config: QuorumConfig,
  pathname: string,
  actor: ActorContext,
): Promise<Response | null> {
  const method = request.method;

  if (pathname === "/sources") {
    if (method === "GET") {
      return await handleListSources(env, actor);
    }
    if (method === "POST") {
      return await handleCreateSource(request, env, actor);
    }
    return null;
  }

  const refreshMatch = /^\/sources\/([^/]+)\/refresh$/.exec(pathname);
  if (refreshMatch && method === "POST") {
    return await handleRefreshSource(env, actor, refreshMatch[1]);
  }

  const sourceMatch = /^\/sources\/([^/]+)$/.exec(pathname);
  if (sourceMatch) {
    const sourceId = sourceMatch[1];
    if (method === "GET") {
      return await handleGetSource(env, actor, sourceId);
    }
    if (method === "DELETE") {
      return await handleDeleteSource(env, actor, sourceId);
    }
  }

  return null;
}

export { parseKnowledgeSourceCreate };
