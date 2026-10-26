import type { QuorumConfig } from "../../config/types.js";
import { sessionCookieSecure, sessionMaxAgeSeconds } from "./browser-session.js";

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

function cookieAttributes(config: QuorumConfig, maxAgeSeconds: number): string {
  const secure = sessionCookieSecure(config);
  const parts = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function setSessionCookieHeader(config: QuorumConfig, rawToken: string): string {
  return `${config.sessionCookieName}=${rawToken}; ${cookieAttributes(config, sessionMaxAgeSeconds(config))}`;
}

export function clearSessionCookieHeader(config: QuorumConfig): string {
  const secure = sessionCookieSecure(config);
  const parts = [
    `${config.sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function setAuthDisplayCookieHeader(
  config: QuorumConfig,
  signedValue: string,
  maxAgeSeconds: number,
): string {
  return `${config.authDisplayCookieName}=${signedValue}; ${cookieAttributes(config, maxAgeSeconds)}`;
}

export function clearAuthDisplayCookieHeader(config: QuorumConfig): string {
  const secure = sessionCookieSecure(config);
  const parts = [
    `${config.authDisplayCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
