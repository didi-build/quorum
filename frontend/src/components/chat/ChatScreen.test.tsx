import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "../../screens/ChatScreen";
import { setChatTransport } from "../../lib/chat/transport";
import { createMockChatTransport } from "../../lib/chat/transport/mock";
import { FIXTURE_DIRECT_RESPONSE } from "../../lib/chat/transport/fixtures";
import * as sourceCount from "../../lib/chat/sourceCount";
import * as useChatWebSocketModule from "../../hooks/useChatWebSocket";
import {
  CHAT_GENERIC_ERROR_MESSAGE,
  genericChatError,
  userFacingChatError,
} from "../../lib/chat/errors";

afterEach(() => {
  cleanup();
  setChatTransport(null);
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("ChatScreen", () => {
  it("shows the no-sources empty state and keeps the composer", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 0;
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText("Connect a source to start")).toBeTruthy();
    });
    expect(screen.getByLabelText("Message")).toBeTruthy();
    expect(screen.getByText("No sources yet. Add one in Connections")).toBeTruthy();
  });

  it("shows the generic error on initial sources failure without the no-sources empty state", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    setChatTransport(transport);
    vi.spyOn(sourceCount, "fetchReadySourceCount").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText("Connect a source to start")).toBeNull();
    });
  });

  it("shows the generic error when history returns 5xx and clears the loading line", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.fetchHistory = async () => {
      throw userFacingChatError(500);
    };
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(
        screen.getByText("Something went wrong on our side. Try again in a moment."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Loading chat history")).toBeNull();
  });

  it("shows the generic error when history returns 404 and clears the loading line", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.fetchHistory = async () => {
      throw userFacingChatError(404);
    };
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeTruthy();
    });
    expect(screen.queryByText("Loading chat history")).toBeNull();
  });

  it("shows the generic error when history fails with Failed to fetch", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.fetchHistory = async () => {
      throw new TypeError("Failed to fetch");
    };
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeTruthy();
    });
  });

  it("shows Connecting live updates before the socket opens", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.delayOpenMs = 200;
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText("Connecting live updates")).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText("Answering from 2 sources")).toBeTruthy();
    });
  });

  it("does not show an error strip when source refresh fails after a successful send", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    setChatTransport(transport);

    const fetchSpy = vi.spyOn(sourceCount, "fetchReadySourceCount");
    fetchSpy
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText("Answering from 2 sources")).toBeTruthy();
    });

    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "How is Quorum deployed?" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(FIXTURE_DIRECT_RESPONSE.content)).toBeTruthy();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeNull();
    expect(screen.getByText("Answering from 2 sources")).toBeTruthy();
  });

  describe("send failure", () => {
    beforeEach(() => {
      vi.spyOn(useChatWebSocketModule, "useChatWebSocket").mockReturnValue({
        connectionState: "connected",
        connected: true,
        sendMessage: vi.fn().mockRejectedValue(genericChatError()),
      });
    });

    it("keeps the user message, shows the error strip, dismisses it, and refocuses the composer", async () => {
      const transport = createMockChatTransport();
      transport.readySourceCount = 2;
      setChatTransport(transport);

      render(<ChatScreen />);

      await waitFor(() => {
        expect(screen.getByText("Answering from 2 sources")).toBeTruthy();
      });

      const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "hello there" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeTruthy();
      });
      expect(screen.getByText("hello there")).toBeTruthy();

      fireEvent.click(screen.getByLabelText("Dismiss"));
      expect(screen.queryByText(CHAT_GENERIC_ERROR_MESSAGE)).toBeNull();

      await waitFor(() => {
        expect(document.activeElement).toBe(textarea);
      });
    });
  });

  it("shows live updates stopped when the socket fails", async () => {
    const transport = createMockChatTransport();
    transport.failOpen = true;
    transport.readySourceCount = 2;
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(
        screen.getAllByText("Live updates stopped. Refresh the page to reconnect.")
          .length,
      ).toBeGreaterThan(0);
    });
  });

  it("renders a direct answer with the first citation open and without didi-build prefix", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.history = {
      session_id: "s",
      messages: [
        {
          id: "a1",
          session_id: "s",
          role: "assistant",
          content: FIXTURE_DIRECT_RESPONSE.content,
          classified_intent: "simple_retrieval",
          response_kind: "direct_answer",
          citations: FIXTURE_DIRECT_RESPONSE.citations,
          council_decision: null,
          write_back_proposal: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText("launchpad/docs/architecture/overview.md")).toBeTruthy();
    });
    expect(screen.queryByText(/didi-build\//)).toBeNull();
    expect(
      screen.getByText("Workers serve the API and the PWA from one origin."),
    ).toBeTruthy();
  });

  it("hides stub API content and shows the Linear stub copy", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.history = {
      session_id: "s",
      messages: [
        {
          id: "a2",
          session_id: "s",
          role: "assistant",
          content: "Linear read request identified, not yet implemented.",
          classified_intent: "linear_read",
          response_kind: "stub_not_implemented",
          citations: [],
          council_decision: null,
          write_back_proposal: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(/Linear actions from chat aren.t available yet/),
      ).toBeTruthy();
    });
    expect(
      screen.queryByText("Linear read request identified, not yet implemented."),
    ).toBeNull();
  });
});
