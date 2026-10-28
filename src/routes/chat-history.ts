import type { QuorumConfig } from "../config/types.js";
import {
  clampHistoryLimit,
  decodeHistoryCursor,
  getSessionMessages,
} from "../domain/chat/service.js";
import type { ChatHistoryResponse } from "../domain/schemas/chat.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { Env } from "../env.js";

const SESSION_MESSAGES_PREFIX = "/chat/sessions/";
const SESSION_MESSAGES_SUFFIX = "/messages";

export function parseChatSessionMessagesPath(pathname: string): string | null {
  if (
    !pathname.startsWith(SESSION_MESSAGES_PREFIX) ||
    !pathname.endsWith(SESSION_MESSAGES_SUFFIX)
  ) {
    return null;
  }
  const encodedSessionId = pathname.slice(
    SESSION_MESSAGES_PREFIX.length,
    pathname.length - SESSION_MESSAGES_SUFFIX.length,
  );
  if (encodedSessionId.length < 1) {
    return null;
  }
  return decodeURIComponent(encodedSessionId);
}

export function parseHistoryLimitParam(raw: string | null): number {
  if (raw === null) {
    return clampHistoryLimit(undefined);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return clampHistoryLimit(undefined);
  }
  return clampHistoryLimit(parsed);
}

export async function handleChatHistoryRoute(
  request: Request,
  env: Env,
  _config: QuorumConfig,
  pathname: string,
  actor: ActorContext,
): Promise<Response | null> {
  const sessionId = parseChatSessionMessagesPath(pathname);
  if (sessionId === null || request.method !== "GET") {
    return null;
  }

  const url = new URL(request.url);
  const limit = parseHistoryLimitParam(url.searchParams.get("limit"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor =
    cursorRaw === null || cursorRaw.length < 1 ? null : decodeHistoryCursor(cursorRaw);

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
