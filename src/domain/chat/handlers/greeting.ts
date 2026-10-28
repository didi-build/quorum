import type { RoutedChatResponse } from "../../schemas/chat.js";

export async function handleGreeting(
  sessionId: string,
  message: string,
): Promise<RoutedChatResponse> {
  const normalized = message.trim().toLowerCase();
  let content: string;
  if (
    normalized === "hi" ||
    normalized === "hello" ||
    normalized === "hey" ||
    normalized === "howdy"
  ) {
    content =
      "Hello! Ask me about the knowledge layer, or bring a strategic question for the council.";
  } else if (normalized.includes("thank")) {
    content =
      "You're welcome. I'm here whenever you need an answer or a council review.";
  } else {
    content =
      "Hi there. I can answer knowledge questions or route strategic reviews to the council.";
  }

  return {
    session_id: sessionId,
    content,
    classified_intent: "greeting",
    response_kind: "direct_answer",
    citations: [],
    council_decision: null,
  };
}
