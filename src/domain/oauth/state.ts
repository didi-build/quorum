/**
 * Signed OAuth state for provider connection flows (v1 `domain.oauth.state`).
 * Login OAuth state uses SESSION_SECRET in `domain/auth/signing.ts`.
 */

import {
  base64UrlToBytes,
  bytesToBase64Url,
  hmacSha256Hex,
  timingSafeEqualHex,
} from "../../lib/crypto.js";
import { deriveOauthStateHmacKey } from "../../lib/hkdf-keys.js";

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

export type OauthConnectionState = {
  state: string;
  nonce: string;
};

export type VerifiedOauthState = {
  userId: string;
  stateNonce: string;
};

function randomNonce(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Single-use Linear connection callbacks (per isolate; entries expire with state TTL). */
const consumedOauthStates = new Map<string, number>();

/** Bound per-isolate memory for consumed-state tracking. */
const CONSUMED_OAUTH_STATES_MAX = 4096;

function purgeConsumedOauthStates(nowSeconds: number): void {
  for (const [state, expiresAt] of consumedOauthStates) {
    if (expiresAt <= nowSeconds) {
      consumedOauthStates.delete(state);
    }
  }
}

function enforceConsumedOauthStatesCap(nowSeconds: number): void {
  purgeConsumedOauthStates(nowSeconds);
  if (consumedOauthStates.size <= CONSUMED_OAUTH_STATES_MAX) {
    return;
  }
  const entries = [...consumedOauthStates.entries()].sort(
    (left, right) => left[1] - right[1],
  );
  const removeCount = consumedOauthStates.size - CONSUMED_OAUTH_STATES_MAX;
  for (let index = 0; index < removeCount; index += 1) {
    consumedOauthStates.delete(entries[index][0]);
  }
}

async function signStatePayload(
  tokenEncryptionKey: string,
  payload: string,
): Promise<string> {
  const secret = await deriveOauthStateHmacKey(tokenEncryptionKey);
  return hmacSha256Hex(secret, payload);
}

export async function createOauthState(
  tokenEncryptionKey: string,
  userId: string,
  ttlSeconds = 600,
): Promise<OauthConnectionState> {
  const nonce = randomNonce();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}:${nonce}:${expiresAt}`;
  const signature = await signStatePayload(tokenEncryptionKey, payload);
  const raw = `${payload}:${signature}`;
  return {
    state: bytesToBase64Url(new TextEncoder().encode(raw)),
    nonce,
  };
}

export async function verifyOauthState(
  tokenEncryptionKey: string,
  state: string,
  options: { singleUse?: boolean } = {},
): Promise<VerifiedOauthState> {
  let payload = "";
  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(state));
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) {
      throw new OAuthStateError("Malformed OAuth state");
    }
    payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const expected = await signStatePayload(tokenEncryptionKey, payload);
    if (!timingSafeEqualHex(signature, expected)) {
      throw new OAuthStateError("Invalid OAuth state signature");
    }
  } catch (error) {
    if (error instanceof OAuthStateError) {
      throw error;
    }
    throw new OAuthStateError("Malformed OAuth state");
  }

  const payloadParts = payload.split(":");
  if (payloadParts.length !== 3) {
    throw new OAuthStateError("Malformed OAuth state payload");
  }
  const [userId, stateNonce, expiresAtStr] = payloadParts;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < nowSeconds) {
    throw new OAuthStateError("Expired OAuth state");
  }

  purgeConsumedOauthStates(nowSeconds);
  if (consumedOauthStates.has(state)) {
    throw new OAuthStateError("Expired OAuth state");
  }
  if (options.singleUse) {
    consumedOauthStates.set(state, expiresAt);
    enforceConsumedOauthStatesCap(nowSeconds);
  }

  return { userId, stateNonce };
}
