/** Worker bindings plus typed config vars and secrets (see `.dev.vars.example`). */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  INDEXING_QUEUE: Queue;
  VECTORIZE: VectorizeIndex;

  APP_ENV?: string;
  APP_BASE_URL?: string;
  DEFAULT_USER_ID?: string;

  TOKEN_ENCRYPTION_KEY?: string;
  BOOTSTRAP_API_KEY?: string;

  GITHUB_APP_OAUTH_CLIENT_ID?: string;
  GITHUB_APP_OAUTH_CLIENT_SECRET?: string;
  GITHUB_AUTH_REDIRECT_URI?: string;
  AUTH_ALLOWED_GITHUB_IDS?: string;
  SESSION_SECRET?: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_TTL_DAYS?: string;
  AUTH_DISPLAY_COOKIE_NAME?: string;
  WS_ALLOWED_ORIGINS?: string;

  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY_BASE64?: string;

  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  LINEAR_REDIRECT_URI?: string;
  LINEAR_SCOPES?: string;

  VOYAGE_API_KEY?: string;
  VOYAGE_BASE_URL?: string;
  VOYAGE_MODEL?: string;
  EMBEDDING_DIMENSIONS?: string;

  CHUNK_TARGET_TOKENS?: string;
  CHUNK_OVERLAP_TOKENS?: string;

  ANTHROPIC_API_KEY?: string;
  SUPERVISOR_MODEL?: string;
  RETRIEVAL_ANSWER_MODEL?: string;
  PERSONA_MODEL?: string;
  COUNCIL_CHAIR_MODEL?: string;

  RRF_K?: string;
  RETRIEVAL_TOP_K?: string;
  COVERAGE_MIN_SCORE?: string;
}
