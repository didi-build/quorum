import type { QuorumConfig } from "../../config/types.js";
import { sessionMaxAgeSeconds } from "./browser-session.js";

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
