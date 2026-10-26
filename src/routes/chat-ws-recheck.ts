import type { QuorumConfig } from "../config/types.js";

/** Re-validate open chat WebSockets at most once per this interval (milliseconds). */
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

/** Test-only: inject a clock (use with fake timers or fixed time). */
export function setChatWsClockForTests(clock: ChatWsClock): void {
  chatWsClock = clock;
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
