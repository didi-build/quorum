const SESSION_KEY = "quorum.chat.session_id";

export function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

/** Removes legacy API key storage from older builds. */
export function clearLegacyApiKeyStorage(): void {
  localStorage.removeItem("domain.api_key");
  localStorage.removeItem("quorum.api_key");
}
