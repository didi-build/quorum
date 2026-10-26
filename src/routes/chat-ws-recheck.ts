import type { QuorumConfig } from "../config/types.js";

/** Minimum spacing between auth re-checks on an open chat WebSocket (milliseconds). */
export const CHAT_WS_SESSION_RECHECK_INTERVAL_MS = 30_000;

export type ChatWsClock = {
  nowMs(): number;
};

const defaultClock: ChatWsClock = {
  nowMs: () => Date.now(),
};

let chatWsClock: ChatWsClock = defaultClock;

export function getChatWsClock(): ChatWsClock {
  return chatWsClock;
}

/** Test-only: restore the default wall clock. */
export function resetChatWsClockForTests(): void {
  chatWsClock = defaultClock;
}

export type ChatWsAuthRecheck = {
  sessionToken: string | null;
  apiKey: string | null;
};

export function buildChatWsAuthRecheckRequest(
  config: QuorumConfig,
  auth: ChatWsAuthRecheck,
): Request {
  const headers: Record<string, string> = {};
  if (auth.sessionToken) {
    headers.Cookie = `${config.sessionCookieName}=${auth.sessionToken}`;
  } else if (auth.apiKey) {
    headers["X-API-Key"] = auth.apiKey;
  }
  return new Request("http://localhost/chat/ws", { headers });
}

export function chatWsRecheckDue(
  lastRecheckAtMs: number,
  nowMs: number,
  intervalMs: number = CHAT_WS_SESSION_RECHECK_INTERVAL_MS,
): boolean {
  return nowMs - lastRecheckAtMs >= intervalMs;
}
