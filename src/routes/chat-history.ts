import type { QuorumConfig } from "../config/types.js";
import {
  clampHistoryLimit,
  decodeHistoryCursor,
  getSessionMessages,
} from "../domain/chat/service.js";
import { CHAT_SESSION_ID_PATTERN } from "../domain/chat/parse-inbound.js";
import type { ChatHistoryResponse } from "../domain/schemas/chat.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { Env } from "../env.js";

const SESSION_MESSAGES_PREFIX = "/chat/sessions/";
const SESSION_MESSAGES_SUFFIX = "/messages";

export type ChatSessionMessagesPathResult =
  { kind: "not_history" } | { kind: "bad_request" } | { kind: "ok"; sessionId: string };

export function parseChatSessionMessagesPathResult(
  pathname: string,
): ChatSessionMessagesPathResult {
  if (
    !pathname.startsWith(SESSION_MESSAGES_PREFIX) ||
    !pathname.endsWith(SESSION_MESSAGES_SUFFIX)
  ) {
    return { kind: "not_history" };
  }
  const encodedSessionId = pathname.slice(
    SESSION_MESSAGES_PREFIX.length,
    pathname.length - SESSION_MESSAGES_SUFFIX.length,
  );
  if (encodedSessionId.length < 1) {
    return { kind: "bad_request" };
  }
  let sessionId: string;
  try {
    sessionId = decodeURIComponent(encodedSessionId);
  } catch {
    return { kind: "bad_request" };
  }
  if (!CHAT_SESSION_ID_PATTERN.test(sessionId)) {
    return { kind: "bad_request" };
  }
  return { kind: "ok", sessionId };
}

export function parseChatSessionMessagesPath(pathname: string): string | null {
  const result = parseChatSessionMessagesPathResult(pathname);
  return result.kind === "ok" ? result.sessionId : null;
}

export function parseHistoryLimitParam(raw: string | null): number | "invalid" {
  if (raw === null) {
    return clampHistoryLimit(undefined);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return "invalid";
  }
  return clampHistoryLimit(parsed);
}

function historyBadRequest(): Response {
  return new Response("Bad Request", { status: 400 });
}

export async function handleChatHistoryRoute(
  request: Request,
  env: Env,
  _config: QuorumConfig,
  pathname: string,
  actor: ActorContext,
): Promise<Response | null> {
  const pathResult = parseChatSessionMessagesPathResult(pathname);
  if (pathResult.kind === "not_history") {
    return null;
  }
  if (pathResult.kind === "bad_request" || request.method !== "GET") {
    if (pathResult.kind === "bad_request") {
      return historyBadRequest();
    }
    return null;
  }

  const sessionId = pathResult.sessionId;
  const url = new URL(request.url);
  const limitParam = parseHistoryLimitParam(url.searchParams.get("limit"));
  if (limitParam === "invalid") {
    return historyBadRequest();
  }
  const limit = limitParam;

  const cursorRaw = url.searchParams.get("cursor");
  let cursor: { createdAt: string; id: string } | null = null;
  if (cursorRaw !== null && cursorRaw.length > 0) {
    const decoded = decodeHistoryCursor(cursorRaw);
    if (decoded === null) {
      return historyBadRequest();
    }
    cursor = decoded;
  }

  const page = await getSessionMessages(env.DB, sessionId, actor, {
    limit,
    cursor,
  });
  const body: ChatHistoryResponse = {
    session_id: sessionId,
    messages: page.messages,
    next_cursor: page.next_cursor,
  };
  return Response.json(body);
}
