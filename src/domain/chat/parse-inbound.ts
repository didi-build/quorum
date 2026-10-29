import type { ChatMessageIn } from "../schemas/chat.js";

export const CHAT_CONTENT_MAX_BYTES = 32 * 1024;
export const CHAT_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class ChatInboundParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatInboundParseError";
  }
}

export function parseChatMessageIn(raw: string): ChatMessageIn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ChatInboundParseError("Invalid JSON");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new ChatInboundParseError("Invalid message body");
  }
  const record = parsed as Record<string, unknown>;
  const sessionId = record.session_id;
  const content = record.content;
  if (typeof sessionId !== "string" || !CHAT_SESSION_ID_PATTERN.test(sessionId)) {
    throw new ChatInboundParseError("session_id is required");
  }
  if (typeof content !== "string" || content.length < 1) {
    throw new ChatInboundParseError("content is required");
  }
  if (new TextEncoder().encode(content).byteLength > CHAT_CONTENT_MAX_BYTES) {
    throw new ChatInboundParseError("content too large");
  }
  return { session_id: sessionId, content };
}
