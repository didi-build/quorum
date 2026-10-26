import type { ConfigEnv } from "../../src/config/load-config.js";

/** Placeholder secrets for unit and worker tests (not real credentials). */
export const testConfigEnv: ConfigEnv = {
  TOKEN_ENCRYPTION_KEY: "test-token-encryption-key",
  SESSION_SECRET: "test-session-secret",
  VOYAGE_API_KEY: "test-voyage-api-key",
  ANTHROPIC_API_KEY: "test-anthropic-api-key",
  GITHUB_APP_OAUTH_CLIENT_SECRET: "test-github-oauth-client-secret",
  GITHUB_APP_OAUTH_CLIENT_ID: "test-github-oauth-client-id",
  GITHUB_APP_PRIVATE_KEY_BASE64: "dGVzdC1wcml2YXRlLWtleQ==",
  LINEAR_CLIENT_SECRET: "test-linear-client-secret",
  BOOTSTRAP_API_KEY: "test-bootstrap-api-key",
};

export function withTestConfigEnv(overrides: ConfigEnv = {}): ConfigEnv {
  return { ...testConfigEnv, ...overrides };
}
