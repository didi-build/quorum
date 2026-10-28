import type { QuorumConfig } from "../config/types.js";
import { getSessionMessages } from "../domain/chat/service.js";
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

  const messages = await getSessionMessages(env.DB, sessionId, actor);
  const body: ChatHistoryResponse = {
    session_id: sessionId,
    messages,
  };
  return Response.json(body);
}
