import type { ChatStatusUpdate } from "../schemas/chat.js";

export interface StatusQueue {
  enqueue(update: ChatStatusUpdate): void | Promise<void>;
}

export async function emitSupervisorStatus(
  statusQueue: StatusQueue | undefined,
  sessionId: string,
  status: string,
): Promise<void> {
  if (statusQueue === undefined) {
    return;
  }
  await statusQueue.enqueue({
    session_id: sessionId,
    scope: "supervisor",
    persona: null,
    status,
  });
}
