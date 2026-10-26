import {
  base64UrlToBytes,
  bytesToBase64Url,
  hmacSha256Hex,
  timingSafeEqualHex,
} from "../../lib/crypto.js";

export class SignedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignedValueError";
  }
}

function signingSecretBytes(sessionSecret: string): Uint8Array {
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return new TextEncoder().encode(sessionSecret);
}

export async function signPayload(
  sessionSecret: string,
  payload: string,
): Promise<string> {
  const signature = await hmacSha256Hex(signingSecretBytes(sessionSecret), payload);
  const raw = `${payload}:${signature}`;
  return bytesToBase64Url(new TextEncoder().encode(raw));
}

export async function verifySignedPayload(
  sessionSecret: string,
  signed: string,
): Promise<string> {
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(base64UrlToBytes(signed));
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon < 0) {
      throw new SignedValueError("Malformed signed value");
    }
    const payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const expected = await hmacSha256Hex(signingSecretBytes(sessionSecret), payload);
    if (!timingSafeEqualHex(signature, expected)) {
      throw new SignedValueError("Invalid signed value signature");
    }
    return payload;
  } catch (error) {
    if (error instanceof SignedValueError) {
      throw error;
    }
    throw new SignedValueError("Malformed signed value");
  }
}

export type LoginOauthState = {
  state: string;
  nonce: string;
};

export async function createLoginOauthState(
  sessionSecret: string,
  ttlSeconds = 600,
): Promise<LoginOauthState> {
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const state = await signPayload(sessionSecret, `login:${nonce}:${expiresAt}`);
  return { state, nonce };
}

export async function verifyLoginOauthState(
  sessionSecret: string,
  state: string,
): Promise<string> {
  const payload = await verifySignedPayload(sessionSecret, state);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new SignedValueError("Malformed login OAuth state");
  }
  const [kind, nonce, expiresAtStr] = parts;
  if (kind !== "login") {
    throw new SignedValueError("Unexpected login OAuth state kind");
  }
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new SignedValueError("Expired login OAuth state");
  }
  return nonce;
}

export async function createAuthDisplayValue(
  sessionSecret: string,
  login: string,
  ttlSeconds = 300,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signPayload(sessionSecret, `display:${login}:${expiresAt}`);
}

export async function verifyAuthDisplayValue(
  sessionSecret: string,
  signed: string,
): Promise<string> {
  const payload = await verifySignedPayload(sessionSecret, signed);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new SignedValueError("Malformed auth display value");
  }
  const [kind, login, expiresAtStr] = parts;
  if (kind !== "display") {
    throw new SignedValueError("Unexpected auth display value kind");
  }
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new SignedValueError("Expired auth display value");
  }
  return login;
}
