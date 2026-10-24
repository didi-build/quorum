import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessageIn,
  ChatResponse,
  ChatStatusUpdate,
  IncomingFrame,
} from "../types/chat";
import { isChatResponse, isChatStatusUpdate } from "../types/chat";
import { getChatTransport } from "../lib/chat/transport";
import type { ChatSocket } from "../lib/chat/transport";
import { SOCKET_OPEN } from "../lib/chat/transport";

export type ChatConnectionState = "connecting" | "connected" | "closed" | "failed";

interface UseChatWebSocketOptions {
  enabled: boolean;
  onStatus: (frame: ChatStatusUpdate) => void;
}

export function useChatWebSocket({ enabled, onStatus }: UseChatWebSocketOptions) {
  const socketRef = useRef<ChatSocket | null>(null);
  const onStatusRef = useRef(onStatus);
  const pendingTurnRef = useRef<{
    resolve: (response: ChatResponse) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [connectionState, setConnectionState] =
    useState<ChatConnectionState>("connecting");

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState("closed");
      return;
    }

    const transport = getChatTransport();
    const socket = transport.openSocket();
    socketRef.current = socket;
    setConnectionState("connecting");

    const handleOpen = () => {
      setConnectionState("connected");
    };

    const handleClose = () => {
      setConnectionState("closed");
      pendingTurnRef.current?.reject(new Error("Chat connection closed."));
      pendingTurnRef.current = null;
    };

    const handleError = () => {
      setConnectionState("failed");
      pendingTurnRef.current?.reject(
        new Error("Something went wrong on our side. Try again in a moment."),
      );
      pendingTurnRef.current = null;
    };

    const handleMessage = (event: Event) => {
      try {
        const frame = JSON.parse(String((event as MessageEvent).data)) as IncomingFrame;
        if (isChatStatusUpdate(frame)) {
          onStatusRef.current(frame);
          return;
        }
        if (isChatResponse(frame)) {
          pendingTurnRef.current?.resolve(frame);
          pendingTurnRef.current = null;
        }
      } catch {
        pendingTurnRef.current?.reject(
          new Error("Received an invalid chat frame from the server."),
        );
        pendingTurnRef.current = null;
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("message", handleMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const sendMessage = useCallback(
    async (payload: ChatMessageIn): Promise<ChatResponse> => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== SOCKET_OPEN) {
        throw new Error("Chat is not connected.");
      }
      if (pendingTurnRef.current) {
        throw new Error("A message is already in flight.");
      }

      return new Promise((resolve, reject) => {
        pendingTurnRef.current = { resolve, reject };
        try {
          socket.send(JSON.stringify(payload));
        } catch {
          pendingTurnRef.current = null;
          reject(new Error("Failed to send message."));
        }
      });
    },
    [],
  );

  return {
    connectionState,
    connected: connectionState === "connected",
    sendMessage,
  };
}
