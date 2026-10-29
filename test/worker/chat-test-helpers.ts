import { vi } from "vitest";
import * as classifierModule from "../../src/domain/chat/classifier.js";

export const TEST_CHAT_SESSION_ID = "00000000-0000-4000-8000-0000000000cc";

export function chatWsPayload(
  content: string,
  sessionId: string = TEST_CHAT_SESSION_ID,
): string {
  return JSON.stringify({ session_id: sessionId, content });
}

export const DEFAULT_BOOTSTRAP_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function ensureDefaultBootstrapUser(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, github_id, login) VALUES (?, 1, 'default-user')`,
    )
    .bind(DEFAULT_BOOTSTRAP_USER_ID)
    .run();
}

export function mockChatClassifierGreeting(): void {
  vi.spyOn(classifierModule, "classifyIntent").mockResolvedValue("greeting");
}
