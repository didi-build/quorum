import type { QuorumConfig } from "../config/types.js";
import { resolveWebSocketActor, websocketOriginAllowed } from "../domain/auth/actor.js";
import type { Env } from "../env.js";

const WS_CLOSE_NOT_AUTHENTICATED = 1008;
const WS_CLOSE_ORIGIN = 1008;

/**
 * Minimal chat WebSocket endpoint for auth gating (full chat pipeline is a separate ticket).
 * Accepts authenticated clients and echoes a single auth probe frame.
 */
export async function handleChatWebSocket(
  request: Request,
  env: Env,
  config: QuorumConfig,
): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const [actor, viaSession] = await resolveWebSocketActor(env.DB, config, request);
  if (actor === null) {
    return new Response("Not authenticated", { status: 401 });
  }

  if (viaSession && !websocketOriginAllowed(config, request.headers.get("Origin"))) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    server.send(
      JSON.stringify({
        authenticated: true,
        user_id: actor.userId,
        echo: event.data,
      }),
    );
  });

  return new Response(null, { status: 101, webSocket: client });
}

export function webSocketPolicyCloseCode(): {
  notAuthenticated: number;
  origin: number;
} {
  return {
    notAuthenticated: WS_CLOSE_NOT_AUTHENTICATED,
    origin: WS_CLOSE_ORIGIN,
  };
}
