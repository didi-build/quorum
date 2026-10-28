import type { QuorumConfig } from "../../config/types.js";
import { classifyIntent, type ClassifierDeps } from "./classifier.js";
import { routeMessage, type RouteMessageParams } from "./router.js";
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
  const routeFn = params.routeMessageFn ?? routeMessage;
  const routePromise = routeFn({
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
  routeMessageFn?: (params: RouteMessageParams) => ReturnType<typeof routeMessage>;
}

export type ProcessMessageInjections = Pick<
  ProcessMessageParams,
  "classifierDeps" | "routeMessageFn"
>;

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

export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 100;

export function encodeHistoryCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function decodeHistoryCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const separator = cursor.indexOf("|");
  if (separator <= 0 || separator >= cursor.length - 1) {
    return null;
  }
  return {
    createdAt: cursor.slice(0, separator),
    id: cursor.slice(separator + 1),
  };
}

export interface SessionMessagesPage {
  messages: ChatMessageOut[];
  next_cursor: string | null;
}

interface HistoryMessageRow extends ChatMessageRow {
  wb_id: string | null;
  wb_chat_message_id: string | null;
  wb_user_id: string | null;
  wb_project_id: string | null;
  wb_plan: string | null;
  wb_feedback_history: string | null;
  wb_status: string | null;
  wb_execution_results: string | null;
  wb_created_at: string | null;
  wb_updated_at: string | null;
  wb_executed_at: string | null;
}

export const HISTORY_MESSAGES_USER_SCOPE_SQL = "m.user_id = ?";

const HISTORY_SELECT = `
  SELECT
    m.id, m.session_id, m.user_id, m.project_id, m.role, m.content,
    m.classified_intent, m.response_kind, m.citations, m.council_decision, m.created_at,
    p.id AS wb_id,
    p.chat_message_id AS wb_chat_message_id,
    p.user_id AS wb_user_id,
    p.project_id AS wb_project_id,
    p.plan AS wb_plan,
    p.feedback_history AS wb_feedback_history,
    p.status AS wb_status,
    p.execution_results AS wb_execution_results,
    p.created_at AS wb_created_at,
    p.updated_at AS wb_updated_at,
    p.executed_at AS wb_executed_at
  FROM chat_messages m
  LEFT JOIN write_back_proposals p ON p.chat_message_id = m.id
`;

function proposalFromHistoryRow(row: HistoryMessageRow): WriteBackProposalRow | null {
  if (row.wb_id === null || row.wb_chat_message_id === null) {
    return null;
  }
  return {
    id: row.wb_id,
    chat_message_id: row.wb_chat_message_id,
    user_id: row.wb_user_id ?? "",
    project_id: row.wb_project_id,
    plan: row.wb_plan ?? "{}",
    feedback_history: row.wb_feedback_history ?? "[]",
    status: row.wb_status ?? "proposed",
    execution_results: row.wb_execution_results ?? "[]",
    created_at: row.wb_created_at ?? row.created_at,
    updated_at: row.wb_updated_at ?? row.created_at,
    executed_at: row.wb_executed_at,
  };
}

function rowToMessageOut(row: HistoryMessageRow): ChatMessageOut {
  const messageRow: ChatMessageRow = {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    project_id: row.project_id,
    role: row.role,
    content: row.content,
    classified_intent: row.classified_intent,
    response_kind: row.response_kind,
    citations: row.citations,
    council_decision: row.council_decision,
    created_at: row.created_at,
  };
  return toMessageOut(messageRow, proposalFromHistoryRow(row));
}

export function clampHistoryLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isInteger(limit) || limit < 1) {
    return HISTORY_DEFAULT_LIMIT;
  }
  return Math.min(limit, HISTORY_MAX_LIMIT);
}

export async function getSessionMessages(
  db: D1Database,
  sessionId: string,
  actor: ActorContext,
  options: {
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
  } = {},
): Promise<SessionMessagesPage> {
  const limit = clampHistoryLimit(options.limit);
  const fetchLimit = limit + 1;
  const cursor = options.cursor ?? null;

  let result: D1Result<HistoryMessageRow>;
  if (cursor === null) {
    result = await db
      .prepare(
        `${HISTORY_SELECT}
         WHERE m.session_id = ? AND ${HISTORY_MESSAGES_USER_SCOPE_SQL}
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT ?`,
      )
      .bind(sessionId, actor.userId, fetchLimit)
      .all<HistoryMessageRow>();
  } else {
    result = await db
      .prepare(
        `${HISTORY_SELECT}
         WHERE m.session_id = ? AND ${HISTORY_MESSAGES_USER_SCOPE_SQL}
           AND (
             m.created_at > ?
             OR (m.created_at = ? AND m.id > ?)
           )
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT ?`,
      )
      .bind(
        sessionId,
        actor.userId,
        cursor.createdAt,
        cursor.createdAt,
        cursor.id,
        fetchLimit,
      )
      .all<HistoryMessageRow>();
  }

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = pageRows.map(rowToMessageOut);
  const last = pageRows.at(-1);
  const next_cursor =
    hasMore && last !== undefined
      ? encodeHistoryCursor(last.created_at, last.id)
      : null;

  return { messages, next_cursor };
}
