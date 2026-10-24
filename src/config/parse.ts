/**
 * Parse comma-separated GitHub user ids (v1 `Settings.allowed_github_ids`).
 */
export function parseAllowedGithubIds(raw: string): ReadonlySet<number> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return new Set();
  }
  const ids = new Set<number>();
  for (const part of trimmed.split(",")) {
    const piece = part.trim();
    if (!piece) {
      continue;
    }
    const id = Number.parseInt(piece, 10);
    if (Number.isNaN(id)) {
      throw new Error(`Invalid GitHub id in AUTH_ALLOWED_GITHUB_IDS: ${piece}`);
    }
    ids.add(id);
  }
  return ids;
}

/**
 * Parse WebSocket allowed origins (v1 `Settings.ws_allowed_origin_set`).
 * When `WS_ALLOWED_ORIGINS` is empty, defaults to the app base URL origin without a trailing slash.
 */
export function parseWsAllowedOriginSet(
  wsAllowedOrigins: string,
  appBaseUrl: string,
): ReadonlySet<string> {
  const raw = wsAllowedOrigins.trim();
  if (raw) {
    const origins = new Set<string>();
    for (const part of raw.split(",")) {
      const piece = part.trim();
      if (!piece) {
        continue;
      }
      origins.add(piece.replace(/\/+$/, ""));
    }
    return origins;
  }
  const base = appBaseUrl.replace(/\/+$/, "");
  return new Set([base]);
}
