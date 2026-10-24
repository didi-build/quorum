const SESSION_KEY = "quorum.chat.session_id";

/** Tab-scoped chat session id (not persisted in localStorage). */
export function getOrCreateSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}
