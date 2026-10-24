import { isChatMockMode } from "../mockMode";
import { createLiveChatTransport } from "./live";
import type { ChatTransport } from "./types";

let transport: ChatTransport | null = null;
let transportPromise: Promise<ChatTransport> | null = null;

export async function resolveChatTransport(): Promise<ChatTransport> {
  if (transport) {
    return transport;
  }
  if (!transportPromise) {
    transportPromise = (async () => {
      if (isChatMockMode()) {
        const { createMockChatTransport } = await import("./mock");
        transport = createMockChatTransport();
      } else {
        transport = createLiveChatTransport();
      }
      return transport;
    })();
  }
  return transportPromise;
}

/** Synchronous accessor for tests and after {@link resolveChatTransport} has run. */
export function getChatTransport(): ChatTransport {
  if (!transport) {
    transport = createLiveChatTransport();
  }
  return transport;
}

export function setChatTransport(next: ChatTransport | null): void {
  transport = next;
  transportPromise = next ? Promise.resolve(next) : null;
}

export type { ChatTransport, ChatSocket } from "./types";
export { SOCKET_OPEN } from "./types";
export { createLiveChatTransport } from "./live";
export { isChatMockMode } from "../mockMode";
