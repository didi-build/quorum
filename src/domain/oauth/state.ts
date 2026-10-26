/**
 * Signed OAuth state for provider connection flows (v1 `domain.oauth.state`).
 * Login OAuth state uses SESSION_SECRET in `domain/auth/signing.ts`.
 */

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

async function hmacSha256Hex(secret: Uint8Array, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64Url(bytes);
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
    if (signature.length !== expected.length) {
      throw new OAuthStateError("Invalid OAuth state signature");
    }
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) {
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
