import type { QuorumConfig } from "../../config/types.js";
import { classifyIntent, type ClassifierDeps } from "./classifier.js";
import { routeMessage } from "./router.js";
import type { ActorContext } from "../schemas/actor.js";
import type {
  ChatIntent,
  ChatMessageOut,
  ChatResponse,
  ChatRole,
  ResponseKind,
} from "../schemas/chat.js";
import { isChatIntent, isResponseKind } from "../schemas/chat.js";
import type { Citation } from "../schemas/citation.js";
import type { CouncilDecision } from "../schemas/council.js";
import type { RetrievalSearchDeps } from "../retrieval/service.js";
import { toProposalOut, type WriteBackProposalRow } from "../writeback/proposal-out.js";

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function abortRejectedPromise(signal: AbortSignal | undefined): Promise<never> | null {
  if (signal === undefined) {
    return null;
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function routeMessageWithAbort(
  params: ProcessMessageParams,
  intent: ChatIntent,
): Promise<Awaited<ReturnType<typeof routeMessage>>> {
  const routePromise = routeMessage({
    sessionId: params.sessionId,
    message: params.content,
    actor: params.actor,
    db: params.db,
    vectorize: params.vectorize,
    config: params.config,
    effectiveProjectId: params.actor.projectId,
    intent,
    classifierDeps: params.classifierDeps,
    retrievalSearchDeps: params.retrievalSearchDeps,
  });
  const abortPromise = abortRejectedPromise(params.signal);
  if (abortPromise === null) {
    return routePromise;
  }
  return Promise.race([routePromise, abortPromise]);
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  project_id: string | null;
  role: string;
  content: string;
  classified_intent: string | null;
  response_kind: string | null;
  citations: string;
  council_decision: string | null;
  created_at: string;
}

function citationPayload(citations: Citation[]): string {
  return JSON.stringify(citations);
}

function councilDecisionPayload(decision: CouncilDecision | null): string | null {
  return decision === null ? null : JSON.stringify(decision);
}

async function persistMessage(
  db: D1Database,
  params: {
    sessionId: string;
    actor: ActorContext;
    role: ChatRole;
    content: string;
    classifiedIntent: ChatIntent | null;
    responseKind: ResponseKind | null;
    citations: Citation[];
    councilDecision: CouncilDecision | null;
  },
): Promise<ChatMessageRow> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO chat_messages (
        id, session_id, user_id, project_id, role, content,
        classified_intent, response_kind, citations, council_decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.sessionId,
      params.actor.userId,
      params.actor.projectId,
      params.role,
      params.content,
      params.classifiedIntent,
      params.responseKind,
      citationPayload(params.citations),
      councilDecisionPayload(params.councilDecision),
    )
    .run();

  const row = await db
    .prepare(
      `SELECT
        id, session_id, user_id, project_id, role, content,
        classified_intent, response_kind, citations, council_decision, created_at
       FROM chat_messages WHERE id = ?`,
    )
    .bind(id)
    .first<ChatMessageRow>();
  if (row === null) {
    throw new Error("Failed to load persisted chat message");
  }
  return row;
}

function parseCitations(raw: string): Citation[] {
  return JSON.parse(raw) as Citation[];
}

function parseCouncilDecision(raw: string | null): CouncilDecision | null {
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as CouncilDecision;
}

function toMessageOut(
  record: ChatMessageRow,
  proposal: WriteBackProposalRow | null,
): ChatMessageOut {
  const role = record.role;
  if (role !== "user" && role !== "assistant") {
    throw new Error(`Unexpected chat role in history: ${role}`);
  }
  return {
    id: record.id,
    session_id: record.session_id,
    role,
    content: record.content,
    classified_intent:
      record.classified_intent !== null && isChatIntent(record.classified_intent)
        ? record.classified_intent
        : null,
    response_kind:
      record.response_kind !== null && isResponseKind(record.response_kind)
        ? record.response_kind
        : null,
    citations: parseCitations(record.citations),
    council_decision: parseCouncilDecision(record.council_decision),
    write_back_proposal: proposal === null ? null : toProposalOut(proposal),
    created_at: record.created_at,
  };
}

export interface ProcessMessageParams {
  db: D1Database;
  vectorize: VectorizeIndex;
  config: QuorumConfig;
  sessionId: string;
  content: string;
  actor: ActorContext;
  intent?: ChatIntent;
  signal?: AbortSignal;
  classifierDeps?: ClassifierDeps;
  retrievalSearchDeps?: RetrievalSearchDeps;
}

export async function processMessage(
  params: ProcessMessageParams,
): Promise<ChatResponse> {
  const resolvedIntent =
    params.intent ??
    (await classifyIntent(params.content, {
      config: params.config,
      ...params.classifierDeps,
    }));

  throwIfAborted(params.signal);

  await persistMessage(params.db, {
    sessionId: params.sessionId,
    actor: params.actor,
    role: "user",
    content: params.content,
    classifiedIntent: resolvedIntent,
    responseKind: null,
    citations: [],
    councilDecision: null,
  });

  throwIfAborted(params.signal);

  const routed = await routeMessageWithAbort(params, resolvedIntent);

  throwIfAborted(params.signal);

  const assistantRecord = await persistMessage(params.db, {
    sessionId: params.sessionId,
    actor: params.actor,
    role: "assistant",
    content: routed.content,
    classifiedIntent: routed.classified_intent,
    responseKind: routed.response_kind,
    citations: routed.citations,
    councilDecision: routed.council_decision,
  });

  return {
    id: assistantRecord.id,
    session_id: routed.session_id,
    content: routed.content,
    classified_intent: routed.classified_intent,
    response_kind: routed.response_kind,
    citations: routed.citations,
    council_decision: routed.council_decision,
  };
}

export async function getSessionMessages(
  db: D1Database,
  sessionId: string,
  actor: ActorContext,
): Promise<ChatMessageOut[]> {
  const result = await db
    .prepare(
      `SELECT
        id, session_id, user_id, project_id, role, content,
        classified_intent, response_kind, citations, council_decision, created_at
       FROM chat_messages
       WHERE session_id = ? AND user_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(sessionId, actor.userId)
    .all<ChatMessageRow>();

  const records = result.results ?? [];
  if (records.length === 0) {
    return [];
  }

  const messageIds = records.map((record) => record.id);
  const placeholders = messageIds.map(() => "?").join(", ");
  const proposalsResult = await db
    .prepare(
      `SELECT
        id, chat_message_id, user_id, project_id, plan, feedback_history,
        status, execution_results, created_at, updated_at, executed_at
       FROM write_back_proposals
       WHERE chat_message_id IN (${placeholders})`,
    )
    .bind(...messageIds)
    .all<WriteBackProposalRow>();

  const proposalsByMessageId = new Map<string, WriteBackProposalRow>();
  for (const proposal of proposalsResult.results ?? []) {
    proposalsByMessageId.set(proposal.chat_message_id, proposal);
  }

  return records.map((record) =>
    toMessageOut(record, proposalsByMessageId.get(record.id) ?? null),
  );
}
