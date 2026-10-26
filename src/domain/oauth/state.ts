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

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

function stateSecretBytes(tokenEncryptionKey: string): Uint8Array {
  if (!tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  return new TextEncoder().encode(tokenEncryptionKey);
}

function randomNonce(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function createOauthState(
  tokenEncryptionKey: string,
  userId: string,
  ttlSeconds = 600,
): Promise<string> {
  const nonce = randomNonce();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}:${nonce}:${expiresAt}`;
  const signature = await hmacSha256Hex(stateSecretBytes(tokenEncryptionKey), payload);
  const raw = `${payload}:${signature}`;
  return bytesToBase64Url(new TextEncoder().encode(raw));
}

export async function verifyOauthState(
  tokenEncryptionKey: string,
  state: string,
): Promise<string> {
  let payload = "";
  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(state));
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) {
      throw new OAuthStateError("Malformed OAuth state");
    }
    payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const expected = await hmacSha256Hex(stateSecretBytes(tokenEncryptionKey), payload);
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
  const [userId, , expiresAtStr] = payloadParts;
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new OAuthStateError("Expired OAuth state");
  }
  return userId;
}
