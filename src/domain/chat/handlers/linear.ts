import type { RoutedChatResponse } from "../../schemas/chat.js";

export async function handleLinearRead(
  sessionId: string,
  _message: string,
): Promise<RoutedChatResponse> {
  return {
    session_id: sessionId,
    content: "Linear read request identified, not yet implemented.",
    classified_intent: "linear_read",
    response_kind: "stub_not_implemented",
    citations: [],
    council_decision: null,
  };
}

export async function handleLinearWrite(
  sessionId: string,
  _message: string,
): Promise<RoutedChatResponse> {
  return {
    session_id: sessionId,
    content: "Linear write request identified, not yet implemented.",
    classified_intent: "linear_write",
    response_kind: "stub_not_implemented",
    citations: [],
    council_decision: null,
  };
}
