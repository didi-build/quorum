import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageIn, ChatResponse, ChatStatusUpdate } from "../types/chat";
import { isChatResponse } from "../types/chat";
import { parseIncomingFrameJson } from "../lib/chat/frameGuards";
import { ChatConnectionLostError, genericChatError } from "../lib/chat/errors";
import { resolveChatTransport } from "../lib/chat/transport";
import type { ChatSocket } from "../lib/chat/transport";
import { SOCKET_OPEN } from "../lib/chat/transport";

export type ChatConnectionState = "connecting" | "connected" | "closed" | "failed";

const DEFAULT_TURN_TIMEOUT_MS = 120_000;

interface UseChatWebSocketOptions {
  enabled: boolean;
  sessionId: string;
  onStatus: (frame: ChatStatusUpdate) => void;
  turnTimeoutMs?: number;
}

export function useChatWebSocket({
  enabled,
  sessionId,
  onStatus,
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
}: UseChatWebSocketOptions) {
  const socketRef = useRef<ChatSocket | null>(null);
  const onStatusRef = useRef(onStatus);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTurnRef = useRef<{
    resolve: (response: ChatResponse) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [connectionState, setConnectionState] =
    useState<ChatConnectionState>("connecting");

  const clearTurnTimeout = useCallback(() => {
    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
  }, []);

  const resetTurnTimeout = useCallback(() => {
    clearTurnTimeout();
    if (!pendingTurnRef.current) {
      return;
    }
    turnTimeoutRef.current = setTimeout(() => {
      pendingTurnRef.current?.reject(genericChatError());
      pendingTurnRef.current = null;
    }, turnTimeoutMs);
  }, [clearTurnTimeout, turnTimeoutMs]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState("closed");
      return;
    }

    let cancelled = false;
    let detachSocket: (() => void) | null = null;

    void resolveChatTransport().then((transport) => {
      if (cancelled) {
        return;
      }

      const socket = transport.openSocket();
      socketRef.current = socket;
      setConnectionState("connecting");

      const handleOpen = () => {
        setConnectionState("connected");
      };

      const handleClose = () => {
        setConnectionState("closed");
        clearTurnTimeout();
        pendingTurnRef.current?.reject(new ChatConnectionLostError());
        pendingTurnRef.current = null;
      };

      const handleError = () => {
        setConnectionState("failed");
        clearTurnTimeout();
        pendingTurnRef.current?.reject(genericChatError());
        pendingTurnRef.current = null;
      };

      const handleMessage = (event: Event) => {
        const frame = parseIncomingFrameJson(
          String((event as MessageEvent).data),
          sessionId,
        );
        if (!frame) {
          return;
        }
        if (!isChatResponse(frame)) {
          onStatusRef.current(frame);
          resetTurnTimeout();
          return;
        }
        clearTurnTimeout();
        pendingTurnRef.current?.resolve(frame);
        pendingTurnRef.current = null;
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
      socket.addEventListener("message", handleMessage);

      detachSocket = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("message", handleMessage);
        socket.close();
        socketRef.current = null;
      };
    });

    return () => {
      cancelled = true;
      clearTurnTimeout();
      pendingTurnRef.current?.reject(new ChatConnectionLostError());
      pendingTurnRef.current = null;
      detachSocket?.();
    };
  }, [enabled, sessionId, clearTurnTimeout, resetTurnTimeout]);

  const sendMessage = useCallback(
    async (payload: ChatMessageIn): Promise<ChatResponse> => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== SOCKET_OPEN) {
        throw genericChatError();
      }
      if (pendingTurnRef.current) {
        throw genericChatError();
      }

      return new Promise((resolve, reject) => {
        pendingTurnRef.current = { resolve, reject };
        resetTurnTimeout();
        try {
          socket.send(JSON.stringify(payload));
        } catch {
          clearTurnTimeout();
          pendingTurnRef.current = null;
          reject(genericChatError());
        }
      });
    },
    [clearTurnTimeout, resetTurnTimeout],
  );

  return {
    connectionState,
    connected: connectionState === "connected",
    sendMessage,
  };
}
