import { ConfigError } from "./errors.js";

const STRICT_INT_PATTERN = /^-?\d+$/;

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
    if (!STRICT_INT_PATTERN.test(piece)) {
      throw ConfigError.invalid("AUTH_ALLOWED_GITHUB_IDS");
    }
    ids.add(Number.parseInt(piece, 10));
  }
  return ids;
}

/**
 * Parse WebSocket allowed origins (v1 `Settings.ws_allowed_origin_set`).
 * When `WS_ALLOWED_ORIGINS` is empty, defaults to the app base URL origin.
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
  return new Set([new URL(appBaseUrl).origin]);
}
