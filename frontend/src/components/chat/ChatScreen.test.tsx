import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatScreen } from "../../screens/ChatScreen";
import { createMockChatTransport, setChatTransport } from "../../lib/chat/transport";

afterEach(() => {
  setChatTransport(null);
  sessionStorage.clear();
});

describe("ChatScreen", () => {
  it("shows the no-sources empty state without a composer", async () => {
    const transport = createMockChatTransport();
    transport.readySourceCount = 0;
    setChatTransport(transport);

    render(<ChatScreen />);

    await waitFor(() => {
      expect(screen.getByText("Connect a source to start")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.getByText("No sources yet. Add one in Connections")).toBeTruthy();
  });
});
