import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import {
  decryptToken,
  encryptToken,
  TokenDecryptError,
} from "../../lib/token-crypto.js";
import {
  fetchLinearTeams,
  LINEAR_ACCESS_LOST_DETAIL,
  LinearHttpUnauthorizedError,
} from "../connections/available-sources.js";
import type { ConnectionRow } from "../db/connections.js";
import { getConnectionById } from "../db/connections.js";
import type { AvailableSourceItem } from "../schemas/available-sources.js";

export class LinearTokenExchangeError extends Error {
  constructor(message = "Linear token exchange failed") {
    super(message);
    this.name = "LinearTokenExchangeError";
  }
}

export class LinearAccessError extends Error {
  constructor(message = "Linear connection is missing access token") {
    super(message);
    this.name = "LinearAccessError";
  }
}

export class LinearReconnectRequiredError extends Error {
  readonly detail: string;

  constructor(detail = LINEAR_ACCESS_LOST_DETAIL) {
    super(detail);
    this.name = "LinearReconnectRequiredError";
    this.detail = detail;
  }
}

const LINEAR_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export type LinearFetch = typeof fetch;

export function linearAuthorizeUrl(config: QuorumConfig, state: string): string {
  if (!config.linearClientId) {
    throw new Error("LINEAR_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: config.linearClientId,
    redirect_uri: config.linearRedirectUri,
    response_type: "code",
    scope: config.linearScopes,
    state,
    actor: "app",
  });
  return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
}

export interface LinearTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export async function linearExchangeCode(
  config: QuorumConfig,
  code: string,
  fetchImpl: LinearFetch = fetch,
): Promise<LinearTokenResponse> {
  if (!config.linearClientSecret) {
    throw new Error("LINEAR_CLIENT_SECRET is not configured");
  }

  let response: Response;
  try {
    response = await fetchImpl(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.linearClientId,
        client_secret: config.linearClientSecret,
        redirect_uri: config.linearRedirectUri,
        code,
      }),
    });
  } catch {
    throw new LinearTokenExchangeError();
  }

  if (!response.ok) {
    throw new LinearTokenExchangeError();
  }

  let payload: LinearTokenResponse & { error?: string };
  try {
    payload = (await response.json()) as LinearTokenResponse & { error?: string };
  } catch {
    throw new LinearTokenExchangeError();
  }

  if (typeof payload.error === "string" && payload.error.length > 0) {
    throw new LinearTokenExchangeError();
  }
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new LinearTokenExchangeError();
  }
  return payload;
}

export async function linearFetchUser(
  accessToken: string,
  fetchImpl: LinearFetch = fetch,
): Promise<{ id: string; name?: string; email?: string }> {
  const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "query { viewer { id name email } }" }),
  });

  if (!response.ok) {
    throw new Error("Linear user fetch failed");
  }

  const data = (await response.json()) as {
    data?: { viewer?: { id?: string; name?: string; email?: string } };
  };
  const viewer = data.data?.viewer;
  if (!viewer || typeof viewer.id !== "string") {
    throw new Error("Linear user payload was invalid");
  }
  return { id: viewer.id, name: viewer.name, email: viewer.email };
}

function displayNameFromUser(user: { name?: string; email?: string }): string {
  return user.name || user.email || "linear-user";
}

export function tokenExpiresAtFromResponse(token: LinearTokenResponse): string | null {
  if (typeof token.expires_in !== "number" || !Number.isFinite(token.expires_in)) {
    return null;
  }
  return new Date(Date.now() + token.expires_in * 1000).toISOString();
}

export async function upsertLinearConnection(
  db: D1Database,
  config: QuorumConfig,
  userId: string,
  token: LinearTokenResponse,
  userInfo: { id: string; name?: string; email?: string },
): Promise<ConnectionRow> {
  const expiresAt = tokenExpiresAtFromResponse(token);
  const displayName = displayNameFromUser(userInfo);
  const now = new Date().toISOString();

  const existing = await db
    .prepare(
      `SELECT id FROM connections WHERE user_id = ? AND provider = 'linear' LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string }>();

  const connectionId = existing?.id ?? crypto.randomUUID();
  const accessCiphertext = await encryptToken(
    config.tokenEncryptionKey,
    connectionId,
    token.access_token,
  );
  const refreshPlain = token.refresh_token;
  const refreshCiphertext =
    typeof refreshPlain === "string" && refreshPlain
      ? await encryptToken(config.tokenEncryptionKey, connectionId, refreshPlain)
      : null;

  if (existing) {
    await db
      .prepare(
        `UPDATE connections SET
          access_token_ciphertext = ?,
          refresh_token_ciphertext = COALESCE(?, refresh_token_ciphertext),
          token_expires_at = ?,
          external_account_id = ?,
          external_account_name = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .bind(
        accessCiphertext,
        refreshCiphertext,
        expiresAt,
        userInfo.id,
        displayName,
        now,
        connectionId,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO connections (
        id, user_id, provider, access_token_ciphertext, refresh_token_ciphertext,
        token_expires_at, external_account_id, external_account_name, updated_at
      ) VALUES (?, ?, 'linear', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        connectionId,
        userId,
        accessCiphertext,
        refreshCiphertext,
        expiresAt,
        userInfo.id,
        displayName,
        now,
      )
      .run();
  }

  const row = await getConnectionById(db, connectionId);
  if (!row) {
    throw new Error("Linear connection upsert failed");
  }
  return row;
}

export function isLinearTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) {
    return false;
  }
  return ms <= Date.now();
}

export async function refreshLinearTokens(
  db: D1Database,
  config: QuorumConfig,
  connection: ConnectionRow,
  fetchImpl: LinearFetch = fetch,
): Promise<ConnectionRow> {
  if (!connection.refresh_token_ciphertext) {
    throw new LinearReconnectRequiredError();
  }
  let refreshPlain: string;
  try {
    refreshPlain = await decryptToken(
      config.tokenEncryptionKey,
      connection.id,
      connection.refresh_token_ciphertext,
    );
  } catch {
    throw new LinearReconnectRequiredError();
  }

  let response: Response;
  try {
    response = await fetchImpl(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.linearClientId,
        client_secret: config.linearClientSecret,
        refresh_token: refreshPlain,
      }),
    });
  } catch {
    throw new LinearReconnectRequiredError();
  }

  if (!response.ok) {
    throw new LinearReconnectRequiredError();
  }

  let token: LinearTokenResponse;
  try {
    token = (await response.json()) as LinearTokenResponse;
  } catch {
    throw new LinearReconnectRequiredError();
  }

  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new LinearReconnectRequiredError();
  }

  return upsertLinearConnection(db, config, connection.user_id, token, {
    id: connection.external_account_id,
    name: connection.external_account_name,
  });
}

export async function getLinearAccessToken(
  db: D1Database,
  config: QuorumConfig,
  connection: ConnectionRow,
  fetchImpl: LinearFetch = fetch,
): Promise<string> {
  if (!connection.access_token_ciphertext) {
    throw new LinearAccessError();
  }

  if (isLinearTokenExpired(connection.token_expires_at)) {
    connection = await refreshLinearTokens(db, config, connection, fetchImpl);
  }

  const ciphertext = connection.access_token_ciphertext;
  if (!ciphertext) {
    throw new LinearAccessError();
  }

  try {
    return await decryptToken(config.tokenEncryptionKey, connection.id, ciphertext);
  } catch (error) {
    if (error instanceof TokenDecryptError) {
      throw new LinearAccessError();
    }
    throw error;
  }
}

export async function fetchLinearTeamsForConnection(
  db: D1Database,
  config: QuorumConfig,
  connection: ConnectionRow,
  fetchImpl: LinearFetch = fetch,
): Promise<AvailableSourceItem[]> {
  const loadTeams = async (conn: ConnectionRow) => {
    const accessToken = await getLinearAccessToken(db, config, conn, fetchImpl);
    return fetchLinearTeams(accessToken, fetchImpl);
  };

  try {
    return await loadTeams(connection);
  } catch (error) {
    if (error instanceof LinearHttpUnauthorizedError) {
      const refreshed = await refreshLinearTokens(db, config, connection, fetchImpl);
      try {
        return await loadTeams(refreshed);
      } catch (retryError) {
        if (retryError instanceof LinearHttpUnauthorizedError) {
          throw new LinearReconnectRequiredError();
        }
        throw retryError;
      }
    }
    throw error;
  }
}
