import { afterEach, describe, expect, it, vi } from "vitest";
import { MockChatTransport } from "./mock";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadTransportIndex() {
  return import("./index");
}

describe("resolveChatTransport", () => {
  it("uses mock in DEV when VITE_CHAT_MOCK is unset", async () => {
    vi.stubEnv("DEV", "true");
    vi.stubEnv("PROD", "");
    vi.stubEnv("VITE_CHAT_MOCK", "");
    const { resolveChatTransport, setChatTransport } = await loadTransportIndex();
    setChatTransport(null);
    const transport = await resolveChatTransport();
    expect(transport).toBeInstanceOf(MockChatTransport);
  });

  it("uses live in DEV when VITE_CHAT_MOCK is false", async () => {
    vi.stubEnv("DEV", "true");
    vi.stubEnv("PROD", "");
    vi.stubEnv("VITE_CHAT_MOCK", "false");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "s", messages: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveChatTransport, setChatTransport } = await loadTransportIndex();
    setChatTransport(null);
    const transport = await resolveChatTransport();
    expect(transport).not.toBeInstanceOf(MockChatTransport);
    await transport.fetchHistory("s");
    expect(fetchMock).toHaveBeenCalledWith(
      "/chat/sessions/s/messages",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses live in PROD even when VITE_CHAT_MOCK is true", async () => {
    vi.stubEnv("DEV", "");
    vi.stubEnv("PROD", "true");
    vi.stubEnv("VITE_CHAT_MOCK", "true");
    const { resolveChatTransport, setChatTransport } = await loadTransportIndex();
    setChatTransport(null);
    const transport = await resolveChatTransport();
    expect(transport).not.toBeInstanceOf(MockChatTransport);
  });
});
