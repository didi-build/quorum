import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useChatWebSocket } from "./useChatWebSocket";
import { createMockChatTransport, setChatTransport } from "../lib/chat/transport";
import { FIXTURE_SESSION_ID } from "../lib/chat/transport/fixtures";

afterEach(() => {
  setChatTransport(null);
});

describe("useChatWebSocket", () => {
  it("connects and returns a direct answer frame", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        onStatus: () => {},
      }),
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("connected");
    });

    const response = await result.current.sendMessage({
      session_id: FIXTURE_SESSION_ID,
      content: "How is Quorum deployed?",
    });

    expect(response.response_kind).toBe("direct_answer");
    expect(response.citations.length).toBeGreaterThan(0);
  });

  it("returns stub responses for Linear-shaped prompts", async () => {
    const transport = createMockChatTransport();
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        onStatus: () => {},
      }),
    );

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    const response = await result.current.sendMessage({
      session_id: FIXTURE_SESSION_ID,
      content: "Create a Linear issue for billing",
    });

    expect(response.response_kind).toBe("stub_not_implemented");
  });
});
