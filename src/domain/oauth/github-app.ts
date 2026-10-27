/**
 * GitHub App JWT and installation tokens (WebCrypto RS256).
 *
 * `GITHUB_APP_PRIVATE_KEY_BASE64` must be PKCS#8 PEM, base64-encoded (not PKCS#1).
 * GitHub often ships a PKCS#1 PEM. Convert with placeholder paths only, for example:
 *
 *   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
 *     -in /path/to/github-app.pem -out /path/to/github-app-pkcs8.pem
 *   base64 -w0 /path/to/github-app-pkcs8.pem
 *
 * Never commit or log the key material.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import type { ConnectionRow } from "../db/connections.js";

export const GITHUB_API_BASE = "https://api.github.com";

interface CachedInstallationToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedInstallationToken>();

export function clearInstallationTokenCache(): void {
  tokenCache.clear();
}

export function isGithubAppConfigured(config: QuorumConfig): boolean {
  return Boolean(
    config.githubAppId && config.githubAppSlug && config.githubAppPrivateKeyBase64,
  );
}

function decodePrivateKeyPkcs8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** `extractable` must remain false so the GitHub App private key cannot be exported. */
async function importSigningKey(privateKeyBase64: string): Promise<CryptoKey> {
  const pkcs8 = decodePrivateKeyPkcs8(privateKeyBase64);
  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function createAppJwt(config: QuorumConfig): Promise<string> {
  if (!config.githubAppId) {
    throw new Error("GITHUB_APP_ID is not configured");
  }
  if (!config.githubAppPrivateKeyBase64) {
    throw new Error("GITHUB_APP_PRIVATE_KEY_BASE64 is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlEncodeJson({
    iat: now - 60,
    exp: now + 10 * 60,
    iss: config.githubAppId,
  });
  const signingInput = `${header}.${payload}`;
  const key = await importSigningKey(config.githubAppPrivateKeyBase64);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const signatureEncoded = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${signingInput}.${signatureEncoded}`;
}

export function githubInstallUrl(config: QuorumConfig, state: string): string {
  if (!config.githubAppSlug) {
    throw new Error("GITHUB_APP_SLUG is not configured");
  }
  const encodedState = encodeURIComponent(state);
  return `https://github.com/apps/${config.githubAppSlug}/installations/new?state=${encodedState}`;
}

export class GithubHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`GitHub HTTP ${statusCode}`);
    this.name = "GithubHttpError";
    this.statusCode = statusCode;
  }
}

export async function fetchInstallation(
  config: QuorumConfig,
  installationId: string,
): Promise<Record<string, unknown>> {
  const appJwt = await createAppJwt(config);
  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok) {
    throw new GithubHttpError(response.status);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function createInstallationAccessToken(
  config: QuorumConfig,
  installationId: string,
): Promise<{ token: string; expiresAtMs: number }> {
  const appJwt = await createAppJwt(config);
  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok) {
    throw new GithubHttpError(response.status);
  }
  const payload = (await response.json()) as { token?: string; expires_at?: string };
  if (!payload.token || !payload.expires_at) {
    throw new Error("Invalid GitHub installation token response");
  }
  const expiresAtMs = Date.parse(payload.expires_at.replace("Z", "+00:00"));
  return { token: payload.token, expiresAtMs };
}

export async function getInstallationAccessToken(
  config: QuorumConfig,
  installationId: string,
): Promise<string> {
  const cached = tokenCache.get(installationId);
  const nowMs = Date.now();
  if (cached !== undefined && cached.expiresAtMs > nowMs + 60_000) {
    return cached.token;
  }

  const { token, expiresAtMs } = await createInstallationAccessToken(
    config,
    installationId,
  );
  tokenCache.set(installationId, { token, expiresAtMs });
  return token;
}

function accountFields(installation: Record<string, unknown>): {
  externalAccountId: string;
  externalAccountName: string;
} {
  const account = installation.account as Record<string, unknown> | undefined;
  if (!account || account.id === undefined) {
    throw new Error("GitHub installation is missing account metadata");
  }
  const externalAccountId = String(account.id);
  const login = account.login;
  const name = account.name;
  const externalAccountName =
    typeof login === "string"
      ? login
      : typeof name === "string"
        ? name
        : "github-account";
  return { externalAccountId, externalAccountName };
}

export async function upsertGithubConnection(
  db: D1Database,
  userId: string,
  installationId: string,
  installation: Record<string, unknown>,
): Promise<ConnectionRow> {
  const { externalAccountId, externalAccountName } = accountFields(installation);
  const existing = await db
    .prepare("SELECT * FROM connections WHERE user_id = ? AND provider = 'github'")
    .bind(userId)
    .first<ConnectionRow>();

  const now = new Date().toISOString();
  if (existing === null) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO connections (
          id, user_id, provider,
          access_token_ciphertext, refresh_token_ciphertext, token_expires_at,
          installation_id, external_account_id, external_account_name,
          created_at, updated_at
        ) VALUES (?, ?, 'github', NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        installationId,
        externalAccountId,
        externalAccountName,
        now,
        now,
      )
      .run();
    const row = await db
      .prepare("SELECT * FROM connections WHERE id = ?")
      .bind(id)
      .first<ConnectionRow>();
    if (!row) {
      throw new Error("Failed to load new GitHub connection");
    }
    return row;
  }

  await db
    .prepare(
      `UPDATE connections SET
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        token_expires_at = NULL,
        installation_id = ?,
        external_account_id = ?,
        external_account_name = ?,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(installationId, externalAccountId, externalAccountName, now, existing.id)
    .run();

  const updated = await db
    .prepare("SELECT * FROM connections WHERE id = ?")
    .bind(existing.id)
    .first<ConnectionRow>();
  if (!updated) {
    throw new Error("Failed to load updated GitHub connection");
  }
  return updated;
}
