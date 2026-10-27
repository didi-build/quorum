import { ConfigError } from "./errors.js";

export const DEFAULT_VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

const ALLOWED_VOYAGE_HOST = "api.voyageai.com";

/**
 * Resolves Voyage API base URL. Empty uses the default. Non-empty must be https://api.voyageai.com only.
 */
export function resolveVoyageBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return DEFAULT_VOYAGE_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw ConfigError.invalid("VOYAGE_BASE_URL");
  }

  if (parsed.protocol !== "https:") {
    throw ConfigError.invalid("VOYAGE_BASE_URL");
  }
  if (parsed.hostname !== ALLOWED_VOYAGE_HOST) {
    throw ConfigError.invalid("VOYAGE_BASE_URL");
  }

  const path = parsed.pathname.replace(/\/$/, "");
  if (path !== "" && path !== "/v1") {
    throw ConfigError.invalid("VOYAGE_BASE_URL");
  }

  return `${parsed.protocol}//${parsed.hostname}/v1`;
}
