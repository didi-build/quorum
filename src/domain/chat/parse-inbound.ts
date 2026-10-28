import type { ChatMessageIn } from "../schemas/chat.js";

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
  if (typeof sessionId !== "string" || sessionId.length < 1) {
    throw new ChatInboundParseError("session_id is required");
  }
  if (typeof content !== "string" || content.length < 1) {
    throw new ChatInboundParseError("content is required");
  }
  return { session_id: sessionId, content };
}
