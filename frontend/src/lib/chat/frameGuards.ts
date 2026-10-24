import type {
  ChatIntent,
  ChatResponse,
  ChatStatusUpdate,
  Citation,
  IncomingFrame,
  ResponseKind,
} from "../../types/chat";

const RESPONSE_KINDS: ResponseKind[] = [
  "direct_answer",
  "council_result",
  "stub_not_implemented",
];

const CHAT_INTENTS: ChatIntent[] = [
  "greeting",
  "simple_retrieval",
  "strategic_session",
  "linear_read",
  "linear_write",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCitation(value: unknown): value is Citation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.document_id === "string" &&
    typeof value.chunk_index === "number" &&
    Number.isFinite(value.chunk_index) &&
    typeof value.knowledge_source_id === "string" &&
    typeof value.excerpt === "string"
  );
}

export function isChatResponseFrame(value: unknown): value is ChatResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.session_id !== "string" ||
    typeof value.content !== "string"
  ) {
    return false;
  }
  if (!RESPONSE_KINDS.includes(value.response_kind as ResponseKind)) {
    return false;
  }
  if (!CHAT_INTENTS.includes(value.classified_intent as ChatIntent)) {
    return false;
  }
  if (!Array.isArray(value.citations)) {
    return false;
  }
  if (!value.citations.every((entry) => isCitation(entry))) {
    return false;
  }
  if (value.council_decision !== null && !isRecord(value.council_decision)) {
    return false;
  }
  return true;
}

export function isChatStatusUpdateFrame(value: unknown): value is ChatStatusUpdate {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.session_id !== "string" || typeof value.status !== "string") {
    return false;
  }
  if (value.scope !== "supervisor" && value.scope !== "persona") {
    return false;
  }
  if (value.persona !== null && typeof value.persona !== "string") {
    return false;
  }
  return true;
}

export function parseIncomingFrame(
  raw: unknown,
  sessionId: string,
): IncomingFrame | null {
  if (isChatStatusUpdateFrame(raw)) {
    if (raw.session_id !== sessionId) {
      return null;
    }
    return raw;
  }
  if (isChatResponseFrame(raw)) {
    if (raw.session_id !== sessionId) {
      return null;
    }
    return raw;
  }
  return null;
}

export function parseIncomingFrameJson(
  data: string,
  sessionId: string,
): IncomingFrame | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return parseIncomingFrame(parsed, sessionId);
  } catch {
    return null;
  }
}
