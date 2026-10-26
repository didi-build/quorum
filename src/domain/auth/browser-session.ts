import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import { isoFrom, isoNow } from "../../lib/time.js";
import { actorContext, type ActorContext } from "../schemas/actor.js";

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function sessionMaxAgeSeconds(config: QuorumConfig): number {
  return config.sessionTtlDays * 24 * 60 * 60;
}

function randomTokenUrlSafe(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return isoFrom(date);
}

function sessionIsActive(expiresAt: string, revokedAt: string | null): boolean {
  if (revokedAt !== null && revokedAt !== undefined && revokedAt !== "") {
    return false;
  }
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return false;
  }
  return expiresMs > Date.now();
}

export async function getOrCreateUser(
  db: D1Database,
  githubId: number,
  login: string,
): Promise<{ id: string; github_id: number; login: string }> {
  const existing = await db
    .prepare("SELECT id, github_id, login FROM users WHERE github_id = ?")
    .bind(githubId)
    .first<{ id: string; github_id: number; login: string }>();

  if (existing) {
    if (existing.login !== login) {
      await db
        .prepare("UPDATE users SET login = ? WHERE id = ?")
        .bind(login, existing.id)
        .run();
      return { ...existing, login };
    }
    return existing;
  }

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)")
    .bind(id, githubId, login)
    .run();
  return { id, github_id: githubId, login };
}

export async function createBrowserSession(
  db: D1Database,
  config: QuorumConfig,
  userId: string,
): Promise<{ rawToken: string; sessionId: string }> {
  const rawToken = randomTokenUrlSafe();
  const tokenHash = await hashSessionToken(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = addDaysIso(config.sessionTtlDays);
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();
  return { rawToken, sessionId };
}

export async function resolveActorFromSessionToken(
  db: D1Database,
  rawToken: string,
): Promise<ActorContext | null> {
  const tokenHash = await hashSessionToken(rawToken);
  const record = await db
    .prepare(
      "SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ? LIMIT 1",
    )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; revoked_at: string | null }>();

  if (!record) {
    return null;
  }
  if (!sessionIsActive(record.expires_at, record.revoked_at)) {
    return null;
  }
  return actorContext(record.user_id);
}

export async function revokeBrowserSession(
  db: D1Database,
  rawToken: string,
): Promise<void> {
  const tokenHash = await hashSessionToken(rawToken);
  const revokedAt = isoNow();
  await db
    .prepare(
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    )
    .bind(revokedAt, tokenHash)
    .run();
}
