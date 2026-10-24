import type { ChatHistoryResponse } from "../../../types/chat";

export interface ChatSocket {
  readonly readyState: number;
  close(): void;
  send(data: string): void;
  addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: Event | MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: Event | MessageEvent) => void,
  ): void;
}

export interface ChatTransport {
  fetchHistory(sessionId: string): Promise<ChatHistoryResponse>;
  openSocket(): ChatSocket;
}

export const SOCKET_OPEN = 1;
