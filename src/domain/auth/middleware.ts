import { jsonDetail } from "../../http/api-error.js";

/** Public API paths (normalized, no trailing slash except root). v1 `PUBLIC_PATHS`. */
export const PUBLIC_API_PATHS = new Set([
  "/health",
  "/ready",
  "/oauth/github/callback",
  "/oauth/linear/callback",
  "/auth/github/login",
  "/auth/github/callback",
  "/auth/access-denied",
]);

const API_PREFIXES = [
  "/auth",
  "/oauth",
  "/chat",
  "/connections",
  "/sources",
  "/retrieval",
  "/writeback",
];

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
}

export function isApiPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return API_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.has(normalizePath(pathname));
}

export function requiresAuthentication(pathname: string): boolean {
  if (!isApiPath(pathname)) {
    return false;
  }
  return !isPublicApiPath(pathname);
}

export function notAuthenticatedResponse(): Response {
  return jsonDetail("Not authenticated", 401);
}
