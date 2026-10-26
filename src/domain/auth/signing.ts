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
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
    if (signature.length !== expected.length) {
      throw new SignedValueError("Invalid signed value signature");
    }
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) {
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

export async function createLoginOauthState(
  sessionSecret: string,
  ttlSeconds = 600,
): Promise<string> {
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signPayload(sessionSecret, `login:${nonce}:${expiresAt}`);
}

export async function verifyLoginOauthState(
  sessionSecret: string,
  state: string,
): Promise<void> {
  const payload = await verifySignedPayload(sessionSecret, state);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new SignedValueError("Malformed login OAuth state");
  }
  const [kind, , expiresAtStr] = parts;
  if (kind !== "login") {
    throw new SignedValueError("Unexpected login OAuth state kind");
  }
  const expiresAt = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    throw new SignedValueError("Expired login OAuth state");
  }
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
