import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatWebSocket } from "./useChatWebSocket";
import { setChatTransport } from "../lib/chat/transport";
import { createMockChatTransport } from "../lib/chat/transport/mock";
import { FIXTURE_SESSION_ID } from "../lib/chat/transport/fixtures";
import { humanizeApiError } from "../lib/authErrors";

afterEach(() => {
  setChatTransport(null);
  vi.useRealTimers();
});

describe("useChatWebSocket", () => {
  it("connects and returns a direct answer frame", async () => {
    const transport = createMockChatTransport();
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        sessionId: FIXTURE_SESSION_ID,
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
        sessionId: FIXTURE_SESSION_ID,
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

  it("ignores malformed frames without crashing", async () => {
    const transport = createMockChatTransport();
    transport.stallSend = true;
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        sessionId: FIXTURE_SESSION_ID,
        onStatus: () => {},
      }),
    );

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    const pending = result.current.sendMessage({
      session_id: FIXTURE_SESSION_ID,
      content: "hello",
    });

    const socket = transport.activeSocket();
    expect(socket).toBeDefined();
    socket?.deliverMessage("not-json");
    socket?.deliverMessage("null");
    socket?.deliverMessage(
      JSON.stringify({
        id: "r1",
        session_id: FIXTURE_SESSION_ID,
        content: "ok",
        classified_intent: "greeting",
        response_kind: "direct_answer",
        citations: [],
        council_decision: null,
      }),
    );

    const response = await pending;
    expect(response.content).toBe("ok");
  });

  it("rejects pending turns on turn timeout with spec copy for the send-failed strip", async () => {
    const transport = createMockChatTransport();
    transport.stallSend = true;
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        sessionId: FIXTURE_SESSION_ID,
        onStatus: () => {},
        turnTimeoutMs: 40,
      }),
    );

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    const pending = result.current.sendMessage({
      session_id: FIXTURE_SESSION_ID,
      content: "hang",
    });

    await expect(pending).rejects.toThrow(humanizeApiError(500, ""));
  }, 10_000);

  it("starts in the connecting state before the socket opens", async () => {
    const transport = createMockChatTransport();
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        sessionId: FIXTURE_SESSION_ID,
        onStatus: () => {},
      }),
    );

    expect(result.current.connectionState).toBe("connecting");
  });

  it("shows failed connection state when the socket errors on open", async () => {
    const transport = createMockChatTransport();
    transport.failOpen = true;
    setChatTransport(transport);

    const { result } = renderHook(() =>
      useChatWebSocket({
        enabled: true,
        sessionId: FIXTURE_SESSION_ID,
        onStatus: () => {},
      }),
    );

    await waitFor(() => {
      expect(["closed", "failed"]).toContain(result.current.connectionState);
    });
  });
});
