import { envFloat, envInt, envString, optionalEnvString } from "./env-string.js";
import { parseAllowedGithubIds, parseWsAllowedOriginSet } from "./parse.js";
import type { QuorumConfig } from "./types.js";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";

export type ConfigEnv = Record<string, unknown>;

export function loadConfig(env: ConfigEnv): QuorumConfig {
  const appBaseUrl = envString(env, "APP_BASE_URL", "http://localhost:8787");
  const authAllowedGithubIdsRaw = envString(env, "AUTH_ALLOWED_GITHUB_IDS", "");
  const wsAllowedOriginsRaw = envString(env, "WS_ALLOWED_ORIGINS", "");

  const allowedGithubIds = parseAllowedGithubIds(authAllowedGithubIdsRaw);
  const wsAllowedOriginSet = parseWsAllowedOriginSet(wsAllowedOriginsRaw, appBaseUrl);

  return {
    appEnv: envString(env, "APP_ENV", "development"),
    appBaseUrl,
    defaultUserId: envString(env, "DEFAULT_USER_ID", DEFAULT_USER_ID),

    tokenEncryptionKey: optionalEnvString(env, "TOKEN_ENCRYPTION_KEY") ?? "",
    bootstrapApiKey: envString(env, "BOOTSTRAP_API_KEY", "dev-api-key-change-me"),

    githubAppOauthClientId: optionalEnvString(env, "GITHUB_APP_OAUTH_CLIENT_ID") ?? "",
    githubAppOauthClientSecret:
      optionalEnvString(env, "GITHUB_APP_OAUTH_CLIENT_SECRET") ?? "",
    githubAuthRedirectUri: envString(
      env,
      "GITHUB_AUTH_REDIRECT_URI",
      "http://localhost:8787/auth/github/callback",
    ),
    authAllowedGithubIdsRaw,
    sessionSecret: envString(env, "SESSION_SECRET", "dev-session-secret-change-me"),
    sessionCookieName: envString(env, "SESSION_COOKIE_NAME", "quorum_session"),
    sessionTtlDays: envInt(env, "SESSION_TTL_DAYS", 30),
    authDisplayCookieName: envString(
      env,
      "AUTH_DISPLAY_COOKIE_NAME",
      "quorum_auth_display",
    ),
    wsAllowedOriginsRaw,

    githubAppId: optionalEnvString(env, "GITHUB_APP_ID") ?? "",
    githubAppSlug: optionalEnvString(env, "GITHUB_APP_SLUG") ?? "",
    githubAppPrivateKeyBase64:
      optionalEnvString(env, "GITHUB_APP_PRIVATE_KEY_BASE64") ?? "",

    linearClientId: optionalEnvString(env, "LINEAR_CLIENT_ID") ?? "",
    linearClientSecret: optionalEnvString(env, "LINEAR_CLIENT_SECRET") ?? "",
    linearRedirectUri: envString(
      env,
      "LINEAR_REDIRECT_URI",
      "http://localhost:8787/oauth/linear/callback",
    ),
    linearScopes: envString(env, "LINEAR_SCOPES", "read write"),

    voyageApiKey: optionalEnvString(env, "VOYAGE_API_KEY") ?? "",
    voyageBaseUrl: optionalEnvString(env, "VOYAGE_BASE_URL") ?? "",
    voyageModel: envString(env, "VOYAGE_MODEL", "voyage-context-4"),
    embeddingDimensions: envInt(env, "EMBEDDING_DIMENSIONS", 1024),

    rrfK: envInt(env, "RRF_K", 60),
    retrievalTopK: envInt(env, "RETRIEVAL_TOP_K", 10),
    coverageMinScore: envFloat(env, "COVERAGE_MIN_SCORE", 0.3),

    chunkTargetTokens: envInt(env, "CHUNK_TARGET_TOKENS", 512),
    chunkOverlapTokens: envInt(env, "CHUNK_OVERLAP_TOKENS", 50),

    anthropicApiKey: optionalEnvString(env, "ANTHROPIC_API_KEY") ?? "",
    supervisorModel: envString(env, "SUPERVISOR_MODEL", "claude-haiku-4-5"),
    retrievalAnswerModel: envString(env, "RETRIEVAL_ANSWER_MODEL", "claude-sonnet-5"),
    personaModel: envString(env, "PERSONA_MODEL", "claude-sonnet-5"),
    councilChairModel: envString(env, "COUNCIL_CHAIR_MODEL", "claude-sonnet-5"),

    allowedGithubIds,
    wsAllowedOriginSet,
  };
}
