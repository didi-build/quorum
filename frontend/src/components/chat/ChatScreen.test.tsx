import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "../../screens/ChatScreen";
import { setChatTransport } from "../../lib/chat/transport";
import { createMockChatTransport } from "../../lib/chat/transport/mock";
import { FIXTURE_DIRECT_RESPONSE } from "../../lib/chat/transport/fixtures";
import * as sourceCount from "../../lib/chat/sourceCount";
import { userFacingChatError } from "../../lib/chat/errors";
import { humanizeApiError } from "../../lib/authErrors";

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

  it("shows mapped error when sources fail without the no-sources empty state", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    setChatTransport(transport);
    vi.spyOn(sourceCount, "fetchReadySourceCount").mockRejectedValue(
      userFacingChatError(500),
    );

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText(humanizeApiError(500, ""))).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText("Connect a source to start")).toBeNull();
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

  it("dismisses the send error strip", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    setChatTransport(transport);
    vi.spyOn(sourceCount, "fetchReadySourceCount").mockRejectedValueOnce(
      userFacingChatError(500),
    );

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText(humanizeApiError(500, ""))).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(humanizeApiError(500, ""))).toBeNull();
  });

  it("renders a direct answer with citations and hides stub API content", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 2;
    transport.history = {
      session_id: "s",
      messages: [
        {
          id: "u1",
          session_id: "s",
          role: "user",
          content: "Q",
          classified_intent: null,
          response_kind: null,
          citations: [],
          council_decision: null,
          write_back_proposal: null,
          created_at: "2026-01-01T00:00:00Z",
        },
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
      expect(screen.getByText(/launchpad\/docs\/architecture/)).toBeTruthy();
    });
    expect(
      screen.queryByText("Linear read request identified, not yet implemented."),
    ).toBeNull();
    expect(
      screen.getByText(/Linear actions from chat aren.t available yet/),
    ).toBeTruthy();
  });
});
