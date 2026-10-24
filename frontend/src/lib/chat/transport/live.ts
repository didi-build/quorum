import type { ChatHistoryResponse } from "../../../types/chat";
import { humanizeApiError } from "../../authErrors";
import type { ChatTransport } from "./types";

function websocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/chat/ws`;
}

async function parseHistory(response: Response): Promise<ChatHistoryResponse> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(humanizeApiError(response.status, detail));
  }
  return (await response.json()) as ChatHistoryResponse;
}

export function createLiveChatTransport(): ChatTransport {
  return {
    async fetchHistory(sessionId: string) {
      const response = await fetch(`/chat/sessions/${sessionId}/messages`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return parseHistory(response);
    },
    openSocket() {
      return new WebSocket(websocketUrl());
    },
  };
}
