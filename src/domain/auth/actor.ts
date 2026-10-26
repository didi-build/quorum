import type { D1Database } from "@cloudflare/workers-types";
import type { QuorumConfig } from "../../config/types.js";
import type { ActorContext } from "../schemas/actor.js";
import { actorContext } from "../schemas/actor.js";
import { validateApiKey } from "./api-key.js";
import { parseCookieHeader } from "./cookies.js";
import { resolveActorFromSessionToken } from "./browser-session.js";

export function websocketOriginAllowed(
  config: QuorumConfig,
  origin: string | null,
): boolean {
  if (!origin) {
    return false;
  }
  const normalized = origin.replace(/\/+$/, "");
  return config.wsAllowedOriginSet.has(normalized);
}

export async function resolveActor(
  db: D1Database,
  config: QuorumConfig,
  request: Request,
): Promise<ActorContext | null> {
  const [actor] = await resolveWebSocketActor(db, config, request);
  return actor;
}

export async function resolveWebSocketActor(
  db: D1Database,
  config: QuorumConfig,
  request: Request,
): Promise<[ActorContext | null, boolean]> {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const sessionToken = cookies.get(config.sessionCookieName);
  if (sessionToken) {
    const sessionActor = await resolveActorFromSessionToken(db, sessionToken);
    if (sessionActor !== null) {
      return [sessionActor, true];
    }
  }

  const apiKey = request.headers.get("X-API-Key");
  if (apiKey) {
    const identity = await validateApiKey(db, config, apiKey);
    if (identity !== null) {
      return [actorContext(identity.userId, identity.projectId), false];
    }
  }

  return [null, false];
}
