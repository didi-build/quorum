import { loadConfig } from "../config/index.js";
import type { QuorumConfig } from "../config/types.js";
import { registerChatWebSocket } from "../domain/auth/chat-ws-registry.js";
import { resolveWebSocketActor, websocketOriginAllowed } from "../domain/auth/actor.js";
import { parseCookieHeader } from "../domain/auth/cookies.js";
import type { Env } from "../env.js";
import {
  attachChatWsInboundHandler,
  deliverChatWsProbeEcho,
} from "./chat-ws-inbound.js";
import {
  buildChatWsAuthRecheckRequest,
  getChatWsClock,
  type ChatWsAuthRecheck,
} from "./chat-ws-recheck.js";

export { CHAT_WS_PROBE_ECHO_MAX_BYTES } from "./chat-ws-inbound.js";

async function recheckChatWsAuth(env: Env, auth: ChatWsAuthRecheck): Promise<boolean> {
  let config: QuorumConfig;
  try {
    config = loadConfig(env);
  } catch {
    return false;
  }
  const request = buildChatWsAuthRecheckRequest(config, auth);
  try {
    const [actor] = await resolveWebSocketActor(env.DB, config, request);
    return actor !== null;
  } catch {
    return false;
  }
}

/**
 * Minimal chat WebSocket endpoint for auth gating (full chat pipeline is a separate ticket).
 * Accepts authenticated clients and echoes a single auth probe frame per inbound message.
 */
export async function handleChatWebSocket(
  request: Request,
  env: Env,
  config: QuorumConfig,
): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const sessionToken = cookies.get(config.sessionCookieName) ?? null;
  if (sessionToken && !websocketOriginAllowed(config, request.headers.get("Origin"))) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const [actor, viaSession] = await resolveWebSocketActor(env.DB, config, request);
  if (actor === null) {
    return new Response("Not authenticated", { status: 401 });
  }

  const apiKey = viaSession ? null : request.headers.get("X-API-Key");
  const authRecheck: ChatWsAuthRecheck = {
    sessionToken: viaSession ? sessionToken : null,
    apiKey,
  };

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  if (viaSession && sessionToken) {
    await registerChatWebSocket(sessionToken, server);
  }

  attachChatWsInboundHandler(server, env, authRecheck, {
    clock: getChatWsClock(),
    recheckAuth: recheckChatWsAuth,
    deliverProbeEcho: deliverChatWsProbeEcho,
  });

  return new Response(null, { status: 101, webSocket: client });
}
