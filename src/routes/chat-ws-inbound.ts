import type { QuorumConfig } from "../config/types.js";
import type { ActorContext } from "../domain/schemas/actor.js";
import type { Env } from "../env.js";
import {
  closeChatWsInternalError,
  deliverChatWsTurn,
  isChatInboundParseError,
  type ChatWsTurnContext,
} from "./chat-ws-pipeline.js";
import {
  type ChatWsAuthRecheck,
  type ChatWsClock,
  chatWsRecheckDue,
} from "./chat-ws-recheck.js";
import { isAbortError } from "../domain/chat/service.js";

export const CHAT_WS_AUTH_INVALID_CLOSE_CODE = 1008;
export const CHAT_WS_AUTH_INVALID_CLOSE_REASON = "auth invalid";

export function closeChatWsAuthInvalid(server: WebSocket): void {
  try {
    server.close(CHAT_WS_AUTH_INVALID_CLOSE_CODE, CHAT_WS_AUTH_INVALID_CLOSE_REASON);
  } catch {
    // ignore close errors on already-closed sockets
  }
}

export type ChatWsHandlerContext = {
  env: Env;
  config: QuorumConfig;
  actor: ActorContext;
};

export type ChatWsInboundDeps = {
  clock: ChatWsClock;
  recheckAuth(env: Env, auth: ChatWsAuthRecheck): Promise<boolean>;
  deliverTurn?: (
    ctx: ChatWsTurnContext,
    rawInbound: string,
    signal: AbortSignal,
  ) => ReturnType<typeof deliverChatWsTurn>;
};

function logChatWsInboundError(error: unknown): void {
  console.error("chat WebSocket inbound handler error", error);
}

export function attachChatWsInboundHandler(
  server: WebSocket,
  handlerContext: ChatWsHandlerContext,
  authRecheck: ChatWsAuthRecheck,
  deps: ChatWsInboundDeps,
): void {
  const deliverTurn = deps.deliverTurn ?? deliverChatWsTurn;
  let lastRecheckAtMs = deps.clock.nowMs();
  let recheckInFlight: Promise<boolean> | null = null;
  let socketClosed = false;
  const queue: string[] = [];
  let draining = false;
  let activeAbort: AbortController | null = null;

  function markSocketClosedAndClearQueue(): void {
    socketClosed = true;
    queue.length = 0;
    activeAbort?.abort();
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
          valid = await deps.recheckAuth(handlerContext.env, authRecheck);
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
    if (socketClosed) {
      return;
    }

    const abortController = new AbortController();
    activeAbort = abortController;
    const turnContext: ChatWsTurnContext = {
      env: handlerContext.env,
      config: handlerContext.config,
      actor: handlerContext.actor,
    };

    try {
      const response = await deliverTurn(turnContext, text, abortController.signal);
      if (socketClosed) {
        return;
      }
      server.send(JSON.stringify(response));
    } catch (error) {
      if (isAbortError(error) || socketClosed) {
        return;
      }
      if (isChatInboundParseError(error)) {
        markSocketClosedAndClearQueue();
        closeChatWsInternalError(server);
        return;
      }
      logChatWsInboundError(error);
      markSocketClosedAndClearQueue();
      closeChatWsInternalError(server);
    } finally {
      if (activeAbort === abortController) {
        activeAbort = null;
      }
    }
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
