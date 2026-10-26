import type { Env } from "../env.js";
import {
  envFloat,
  envInt,
  envString,
  optionalEnvString,
  requireEnvString,
} from "./env-string.js";
import { rejectDevPlaceholderSecrets, resolveAppEnv } from "./placeholder-secrets.js";
import { parseAllowedGithubIds, parseWsAllowedOriginSet } from "./parse.js";
import { REQUIRED_SECRET_KEYS } from "./required-secrets.js";
import type { QuorumConfig } from "./types.js";
import { ConfigError } from "./errors.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";

export type ConfigEnv = Record<string, unknown>;

function asConfigEnv(env: Env | ConfigEnv): ConfigEnv {
  return env as ConfigEnv;
}

function requireSecrets(env: ConfigEnv): void {
  for (const key of REQUIRED_SECRET_KEYS) {
    requireEnvString(env, key);
  }
}

export function loadConfig(env: Env | ConfigEnv): QuorumConfig {
  const configEnv = asConfigEnv(env);
  requireSecrets(configEnv);

  const appEnv = resolveAppEnv(optionalEnvString(configEnv, "APP_ENV"));

  const tokenEncryptionKey = requireEnvString(configEnv, "TOKEN_ENCRYPTION_KEY");
  const sessionSecret = requireEnvString(configEnv, "SESSION_SECRET");
  const bootstrapApiKey = requireEnvString(configEnv, "BOOTSTRAP_API_KEY");
  const voyageApiKey = requireEnvString(configEnv, "VOYAGE_API_KEY");
  const anthropicApiKey = requireEnvString(configEnv, "ANTHROPIC_API_KEY");
  const githubAppOauthClientSecret = requireEnvString(
    configEnv,
    "GITHUB_APP_OAUTH_CLIENT_SECRET",
  );
  const githubAppPrivateKeyBase64 = requireEnvString(
    configEnv,
    "GITHUB_APP_PRIVATE_KEY_BASE64",
  );
  const linearClientSecret = requireEnvString(configEnv, "LINEAR_CLIENT_SECRET");

  rejectDevPlaceholderSecrets(appEnv, {
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    SESSION_SECRET: sessionSecret,
    BOOTSTRAP_API_KEY: bootstrapApiKey,
    VOYAGE_API_KEY: voyageApiKey,
    ANTHROPIC_API_KEY: anthropicApiKey,
    GITHUB_APP_OAUTH_CLIENT_SECRET: githubAppOauthClientSecret,
    GITHUB_APP_PRIVATE_KEY_BASE64: githubAppPrivateKeyBase64,
    LINEAR_CLIENT_SECRET: linearClientSecret,
  });

  const appBaseUrl = envString(configEnv, "APP_BASE_URL", "http://localhost:8787");
  const authAllowedGithubIdsRaw = envString(configEnv, "AUTH_ALLOWED_GITHUB_IDS", "");
  const wsAllowedOriginsRaw = envString(configEnv, "WS_ALLOWED_ORIGINS", "");

  const allowedGithubIds = parseAllowedGithubIds(authAllowedGithubIdsRaw);
  const wsAllowedOriginSet = parseWsAllowedOriginSet(wsAllowedOriginsRaw, appBaseUrl);

  const sessionTtlDays = envInt(configEnv, "SESSION_TTL_DAYS", 30);
  if (sessionTtlDays <= 0) {
    throw ConfigError.invalid("SESSION_TTL_DAYS");
  }

  return {
    appEnv,
    appBaseUrl,
    defaultUserId: envString(configEnv, "DEFAULT_USER_ID", DEFAULT_USER_ID),

    tokenEncryptionKey,
    bootstrapApiKey,

    githubAppOauthClientId:
      optionalEnvString(configEnv, "GITHUB_APP_OAUTH_CLIENT_ID") ?? "",
    githubAppOauthClientSecret,
    githubAuthRedirectUri: envString(
      configEnv,
      "GITHUB_AUTH_REDIRECT_URI",
      "http://localhost:8787/auth/github/callback",
    ),
    authAllowedGithubIdsRaw,
    sessionSecret,
    sessionCookieName: envString(configEnv, "SESSION_COOKIE_NAME", "quorum_session"),
    sessionTtlDays,
    authDisplayCookieName: envString(
      configEnv,
      "AUTH_DISPLAY_COOKIE_NAME",
      "quorum_auth_display",
    ),
    wsAllowedOriginsRaw,

    githubAppId: optionalEnvString(configEnv, "GITHUB_APP_ID") ?? "",
    githubAppSlug: optionalEnvString(configEnv, "GITHUB_APP_SLUG") ?? "",
    githubAppPrivateKeyBase64,

    linearClientId: optionalEnvString(configEnv, "LINEAR_CLIENT_ID") ?? "",
    linearClientSecret,
    linearRedirectUri: envString(
      configEnv,
      "LINEAR_REDIRECT_URI",
      "http://localhost:8787/oauth/linear/callback",
    ),
    linearScopes: envString(configEnv, "LINEAR_SCOPES", "read write"),

    voyageApiKey,
    voyageBaseUrl: optionalEnvString(configEnv, "VOYAGE_BASE_URL") ?? "",
    voyageModel: envString(configEnv, "VOYAGE_MODEL", "voyage-context-4"),
    embeddingDimensions: envInt(configEnv, "EMBEDDING_DIMENSIONS", 1024),

    rrfK: envInt(configEnv, "RRF_K", 60),
    retrievalTopK: envInt(configEnv, "RETRIEVAL_TOP_K", 10),
    coverageMinScore: envFloat(configEnv, "COVERAGE_MIN_SCORE", 0.3),

    chunkTargetTokens: envInt(configEnv, "CHUNK_TARGET_TOKENS", 512),
    chunkOverlapTokens: envInt(configEnv, "CHUNK_OVERLAP_TOKENS", 50),

    anthropicApiKey,
    supervisorModel: envString(configEnv, "SUPERVISOR_MODEL", "claude-haiku-4-5"),
    retrievalAnswerModel: envString(
      configEnv,
      "RETRIEVAL_ANSWER_MODEL",
      "claude-sonnet-5",
    ),
    personaModel: envString(configEnv, "PERSONA_MODEL", "claude-sonnet-5"),
    councilChairModel: envString(configEnv, "COUNCIL_CHAIR_MODEL", "claude-sonnet-5"),

    allowedGithubIds,
    wsAllowedOriginSet,
  };
}
