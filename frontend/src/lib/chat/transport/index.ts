import { createLiveChatTransport } from "./live";
import { createMockChatTransport, isChatMockMode } from "./mock";
import type { ChatTransport } from "./types";

let transport: ChatTransport | null = null;

export function getChatTransport(): ChatTransport {
  if (!transport) {
    transport = isChatMockMode()
      ? createMockChatTransport()
      : createLiveChatTransport();
  }
  return transport;
}

export function setChatTransport(next: ChatTransport | null): void {
  transport = next;
}

export type { ChatTransport, ChatSocket } from "./types";
export { SOCKET_OPEN } from "./types";
export { createLiveChatTransport } from "./live";
export { createMockChatTransport, isChatMockMode, MockChatTransport } from "./mock";
