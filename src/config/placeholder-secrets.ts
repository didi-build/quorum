import { ConfigError } from "./errors.js";
import type { RequiredSecretKey } from "./required-secrets.js";

/** Placeholder values from `.dev.vars.example` that must not be used outside development. */
export const DEV_VARS_EXAMPLE_PLACEHOLDERS: Readonly<
  Record<string, readonly string[]>
> = {
  TOKEN_ENCRYPTION_KEY: ["placeholder-generate-for-real-env"],
  SESSION_SECRET: ["dev-session-secret-change-me"],
  BOOTSTRAP_API_KEY: ["dev-api-key-change-me"],
  VOYAGE_API_KEY: ["placeholder-voyage-api-key"],
  ANTHROPIC_API_KEY: ["placeholder-anthropic-api-key"],
  GITHUB_APP_OAUTH_CLIENT_SECRET: ["placeholder-github-oauth-client-secret"],
  GITHUB_APP_PRIVATE_KEY_BASE64: ["placeholder-base64-pkcs8-key"],
  LINEAR_CLIENT_SECRET: ["placeholder-linear-client-secret"],
};

const PLACEHOLDER_CHECK_KEYS: readonly string[] = [
  "TOKEN_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "BOOTSTRAP_API_KEY",
  "VOYAGE_API_KEY",
  "ANTHROPIC_API_KEY",
  "GITHUB_APP_OAUTH_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY_BASE64",
  "LINEAR_CLIENT_SECRET",
];

export function resolveAppEnv(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    return "production";
  }
  return raw.trim();
}

export function isDevelopmentAppEnv(appEnv: string): boolean {
  return appEnv === "development";
}

export function rejectDevPlaceholderSecrets(
  appEnv: string,
  secrets: Record<string, string>,
): void {
  if (isDevelopmentAppEnv(appEnv)) {
    return;
  }
  for (const key of PLACEHOLDER_CHECK_KEYS) {
    const value = secrets[key];
    const placeholders = DEV_VARS_EXAMPLE_PLACEHOLDERS[key];
    if (!value || !placeholders) {
      continue;
    }
    if (placeholders.includes(value)) {
      throw ConfigError.invalid(key);
    }
  }
}

export type SecretValuesForPlaceholderCheck = Record<
  RequiredSecretKey | "BOOTSTRAP_API_KEY",
  string
>;
