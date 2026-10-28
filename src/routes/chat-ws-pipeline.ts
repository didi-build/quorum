import { loadConfig } from "../config/index.js";
import type { QuorumConfig } from "../config/types.js";
import { processMessage } from "../domain/chat/service.js";
import {
  parseChatMessageIn,
  ChatInboundParseError,
} from "../domain/chat/parse-inbound.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { ChatResponse } from "../domain/schemas/chat.js";
import type { Env } from "../env.js";

export const CHAT_WS_INTERNAL_ERROR_CLOSE_CODE = 1011;
export const CHAT_WS_INTERNAL_ERROR_CLOSE_REASON = "Internal error";

export interface ChatWsTurnContext {
  env: Env;
  config: QuorumConfig;
  actor: ActorContext;
}

export async function deliverChatWsTurn(
  ctx: ChatWsTurnContext,
  rawInbound: string,
  signal: AbortSignal,
): Promise<ChatResponse> {
  const inbound = parseChatMessageIn(rawInbound);
  return processMessage({
    db: ctx.env.DB,
    vectorize: ctx.env.VECTORIZE,
    config: ctx.config,
    sessionId: inbound.session_id,
    content: inbound.content,
    actor: ctx.actor,
    signal,
  });
}

export function closeChatWsInternalError(server: WebSocket): void {
  try {
    server.close(
      CHAT_WS_INTERNAL_ERROR_CLOSE_CODE,
      CHAT_WS_INTERNAL_ERROR_CLOSE_REASON,
    );
  } catch {
    // ignore close errors on already-closed sockets
  }
}

export function isChatInboundParseError(
  error: unknown,
): error is ChatInboundParseError {
  return error instanceof ChatInboundParseError;
}

/** Test helper: run turn with config loaded from env. */
export async function deliverChatWsTurnFromEnv(
  env: Env,
  actor: ActorContext,
  rawInbound: string,
  signal: AbortSignal,
): Promise<ChatResponse> {
  const config = loadConfig(env);
  return deliverChatWsTurn({ env, config, actor }, rawInbound, signal);
}
