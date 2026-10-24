import type {
  ChatHistoryResponse,
  ChatMessageIn,
  ChatResponse,
} from "../../../types/chat";
import {
  FIXTURE_DIRECT_RESPONSE,
  FIXTURE_EMPTY_HISTORY,
  FIXTURE_STUB_RESPONSE,
} from "./fixtures";
import type { ChatSocket, ChatTransport } from "./types";
import { SOCKET_OPEN } from "./types";

class MockChatSocket implements ChatSocket {
  readyState = 0;
  private listeners: Record<string, Set<(event: Event | MessageEvent) => void>> = {
    open: new Set(),
    close: new Set(),
    error: new Set(),
    message: new Set(),
  };

  constructor(private readonly transport: MockChatTransport) {
    queueMicrotask(() => {
      this.readyState = SOCKET_OPEN;
      this.emit("open", new Event("open"));
    });
  }

  addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: Event | MessageEvent) => void,
  ): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: Event | MessageEvent) => void,
  ): void {
    this.listeners[type].delete(listener);
  }

  close(): void {
    if (this.readyState === SOCKET_OPEN) {
      this.readyState = 3;
      this.emit("close", new Event("close"));
    }
  }

  send(data: string): void {
    if (this.transport.stallSend) {
      return;
    }
    const payload = JSON.parse(data) as ChatMessageIn;
    if (this.transport.failSend) {
      queueMicrotask(() => {
        this.emit("error", new Event("error"));
      });
      return;
    }
    const response = buildMockResponse(payload);
    queueMicrotask(() => {
      this.deliverMessage(JSON.stringify(response));
    });
  }

  emit(
    type: "open" | "close" | "error" | "message",
    event: Event | MessageEvent,
  ): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }

  deliverMessage(data: string): void {
    this.emit("message", new MessageEvent("message", { data }));
  }
}

export class MockChatTransport implements ChatTransport {
  history: ChatHistoryResponse = FIXTURE_EMPTY_HISTORY;
  readySourceCount = 2;
  failOpen = false;
  failSend = false;
  stallSend = false;
  private sockets = new Set<MockChatSocket>();

  activeSocket(): MockChatSocket | undefined {
    return [...this.sockets].at(-1);
  }

  async fetchHistory(sessionId: string): Promise<ChatHistoryResponse> {
    return {
      ...this.history,
      session_id: sessionId,
    };
  }

  openSocket(): ChatSocket {
    const socket = new MockChatSocket(this);
    this.sockets.add(socket);
    if (this.failOpen) {
      queueMicrotask(() => {
        socket.emit("error", new Event("error"));
        socket.close();
      });
    }
    return socket;
  }
}

function buildMockResponse(payload: ChatMessageIn): ChatResponse {
  const normalized = payload.content.toLowerCase();
  if (normalized.includes("linear")) {
    return { ...FIXTURE_STUB_RESPONSE, session_id: payload.session_id };
  }
  return { ...FIXTURE_DIRECT_RESPONSE, session_id: payload.session_id };
}

export function createMockChatTransport(): MockChatTransport {
  return new MockChatTransport();
}
