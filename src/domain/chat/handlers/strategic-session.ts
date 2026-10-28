import type { RoutedChatResponse } from "../../schemas/chat.js";
import { emitSupervisorStatus, type StatusQueue } from "../status.js";

const STRATEGIC_SESSION_PLACEHOLDER =
  "Council review is not available yet. Strategic sessions will route to the AI seat council in a follow-up release.";

/** Placeholder until council fan-out ships (v1 `run_council`). */
export async function handleStrategicSession(
  sessionId: string,
  _message: string,
  statusQueue?: StatusQueue,
): Promise<RoutedChatResponse> {
  await emitSupervisorStatus(statusQueue, sessionId, "alerting_council");
  return {
    session_id: sessionId,
    content: STRATEGIC_SESSION_PLACEHOLDER,
    classified_intent: "strategic_session",
    response_kind: "direct_answer",
    citations: [],
    council_decision: null,
  };
}

export { STRATEGIC_SESSION_PLACEHOLDER };
