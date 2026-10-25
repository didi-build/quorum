/** Worker secrets that must be set (names only; values live in Wrangler secrets / `.dev.vars`). */
export const REQUIRED_SECRET_KEYS = [
  "TOKEN_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "VOYAGE_API_KEY",
  "ANTHROPIC_API_KEY",
  "GITHUB_APP_OAUTH_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY_BASE64",
  "LINEAR_CLIENT_SECRET",
] as const;

export type RequiredSecretKey = (typeof REQUIRED_SECRET_KEYS)[number];
