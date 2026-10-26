import { hashSessionToken } from "./browser-session.js";

const socketsByTokenHash = new Map<string, Set<WebSocket>>();

function removeSocket(tokenHash: string, socket: WebSocket): void {
  const set = socketsByTokenHash.get(tokenHash);
  if (!set) {
    return;
  }
  set.delete(socket);
  if (set.size === 0) {
    socketsByTokenHash.delete(tokenHash);
  }
}

/** Register an open chat WebSocket for logout teardown (same isolate only). */
export async function registerChatWebSocket(
  rawSessionToken: string,
  socket: WebSocket,
): Promise<void> {
  const tokenHash = await hashSessionToken(rawSessionToken);
  let set = socketsByTokenHash.get(tokenHash);
  if (!set) {
    set = new Set();
    socketsByTokenHash.set(tokenHash, set);
  }
  set.add(socket);
  socket.addEventListener("close", () => {
    removeSocket(tokenHash, socket);
  });
}

/** Close live chat WebSockets for a browser session (e.g. on logout). */
export async function closeChatWebSocketsForSession(
  rawSessionToken: string,
): Promise<void> {
  const tokenHash = await hashSessionToken(rawSessionToken);
  const set = socketsByTokenHash.get(tokenHash);
  if (!set) {
    return;
  }
  for (const socket of set) {
    try {
      socket.close(1000, "session ended");
    } catch {
      // ignore close errors on already-closed sockets
    }
  }
  socketsByTokenHash.delete(tokenHash);
}

/** Test-only: reset registry between worker tests. */
export function resetChatWebSocketRegistry(): void {
  socketsByTokenHash.clear();
}
