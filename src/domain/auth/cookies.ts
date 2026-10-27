import type { QuorumConfig } from "../../config/types.js";
import { sessionMaxAgeSeconds } from "./browser-session.js";

/** Short-lived cookie binding OAuth login state to the initiating browser (`__Host-` prefix). */
export const OAUTH_LOGIN_NONCE_COOKIE_NAME = "__Host-quorum_oauth_login_nonce";
/** Binds provider connection OAuth state to the initiating browser session. */
export const OAUTH_CONNECTION_NONCE_COOKIE_NAME =
  "__Host-quorum_oauth_connection_nonce";

const OAUTH_LOGIN_NONCE_MAX_AGE_SECONDS = 600;

function oauthLoginNonceCookieAttributes(maxAgeSeconds: number): string {
  return [
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    cookies.set(name, value);
  }
  return cookies;
}

/** v1 parity: HttpOnly, Secure, SameSite=Lax on all auth cookies (including localhost). */
function cookieAttributes(maxAgeSeconds: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function setSessionCookieHeader(config: QuorumConfig, rawToken: string): string {
  return `${config.sessionCookieName}=${rawToken}; ${cookieAttributes(sessionMaxAgeSeconds(config))}`;
}

export function clearSessionCookieHeader(config: QuorumConfig): string {
  return [
    `${config.sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function setAuthDisplayCookieHeader(
  config: QuorumConfig,
  signedValue: string,
  maxAgeSeconds: number,
): string {
  return `${config.authDisplayCookieName}=${signedValue}; ${cookieAttributes(maxAgeSeconds)}`;
}

export function clearAuthDisplayCookieHeader(config: QuorumConfig): string {
  return [
    `${config.authDisplayCookieName}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function setOAuthLoginNonceCookieHeader(nonce: string): string {
  return `${OAUTH_LOGIN_NONCE_COOKIE_NAME}=${nonce}; ${oauthLoginNonceCookieAttributes(OAUTH_LOGIN_NONCE_MAX_AGE_SECONDS)}`;
}

export function clearOAuthLoginNonceCookieHeader(): string {
  return `${OAUTH_LOGIN_NONCE_COOKIE_NAME}=; ${oauthLoginNonceCookieAttributes(0)}`;
}

export function setOAuthConnectionNonceCookieHeader(nonce: string): string {
  return `${OAUTH_CONNECTION_NONCE_COOKIE_NAME}=${nonce}; ${oauthLoginNonceCookieAttributes(OAUTH_LOGIN_NONCE_MAX_AGE_SECONDS)}`;
}

export function clearOAuthConnectionNonceCookieHeader(): string {
  return `${OAUTH_CONNECTION_NONCE_COOKIE_NAME}=; ${oauthLoginNonceCookieAttributes(0)}`;
}
