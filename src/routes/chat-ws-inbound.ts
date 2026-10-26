import type { Env } from "../env.js";
import { truncateUtf8ToMaxBytes } from "../lib/utf8.js";
import {
  type ChatWsAuthRecheck,
  type ChatWsClock,
  chatWsRecheckDue,
} from "./chat-ws-recheck.js";

export const CHAT_WS_PROBE_ECHO_MAX_BYTES = 4096;

export const CHAT_WS_AUTH_INVALID_CLOSE_CODE = 1008;
export const CHAT_WS_AUTH_INVALID_CLOSE_REASON = "auth invalid";

export function closeChatWsAuthInvalid(server: WebSocket): void {
  try {
    server.close(CHAT_WS_AUTH_INVALID_CLOSE_CODE, CHAT_WS_AUTH_INVALID_CLOSE_REASON);
  } catch {
    // ignore close errors on already-closed sockets
  }
}

/** Probe echo after auth gating. Future server-initiated sends must use the same gate. */
export async function deliverChatWsProbeEcho(
  server: WebSocket,
  text: string,
): Promise<void> {
  const echo = truncateUtf8ToMaxBytes(text, CHAT_WS_PROBE_ECHO_MAX_BYTES);
  server.send(JSON.stringify({ authenticated: true, echo }));
}

export type ChatWsInboundDeps = {
  clock: ChatWsClock;
  recheckAuth(env: Env, auth: ChatWsAuthRecheck): Promise<boolean>;
  deliverProbeEcho(server: WebSocket, text: string): Promise<void>;
};

function logChatWsInboundError(error: unknown): void {
  console.error("chat WebSocket inbound handler error", error);
}

export function attachChatWsInboundHandler(
  server: WebSocket,
  env: Env,
  authRecheck: ChatWsAuthRecheck,
  deps: ChatWsInboundDeps,
): void {
  let lastRecheckAtMs = deps.clock.nowMs();
  let recheckInFlight: Promise<boolean> | null = null;
  let socketClosed = false;
  const queue: string[] = [];
  let draining = false;

  function markSocketClosedAndClearQueue(): void {
    socketClosed = true;
    queue.length = 0;
  }

  async function runRecheckIfDue(nowMs: number): Promise<boolean> {
    if (!chatWsRecheckDue(lastRecheckAtMs, nowMs)) {
      return true;
    }
    if (recheckInFlight) {
      return recheckInFlight;
    }
    recheckInFlight = (async () => {
      try {
        let valid: boolean;
        try {
          valid = await deps.recheckAuth(env, authRecheck);
        } catch {
          return false;
        }
        if (valid) {
          lastRecheckAtMs = nowMs;
        }
        return valid;
      } finally {
        recheckInFlight = null;
      }
    })();
    return recheckInFlight;
  }

  async function processOne(text: string): Promise<void> {
    if (socketClosed) {
      return;
    }
    const nowMs = deps.clock.nowMs();
    const stillValid = await runRecheckIfDue(nowMs);
    if (!stillValid) {
      markSocketClosedAndClearQueue();
      closeChatWsAuthInvalid(server);
      return;
    }
    await deps.deliverProbeEcho(server, text);
  }

  async function drainQueue(): Promise<void> {
    if (draining) {
      return;
    }
    draining = true;
    try {
      while (queue.length > 0 && !socketClosed) {
        const text = queue.shift()!;
        await processOne(text);
      }
    } finally {
      draining = false;
      if (queue.length > 0 && !socketClosed) {
        void drainQueue().catch(logChatWsInboundError);
      }
    }
  }

  server.addEventListener("close", () => {
    markSocketClosedAndClearQueue();
  });

  server.addEventListener("message", (event) => {
    void (async () => {
      if (typeof event.data !== "string") {
        return;
      }
      if (socketClosed) {
        return;
      }
      queue.push(event.data);
      await drainQueue();
    })().catch(logChatWsInboundError);
  });
}
