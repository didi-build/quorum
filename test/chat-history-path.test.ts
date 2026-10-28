import { describe, expect, it } from "vitest";
import { parseChatSessionMessagesPath } from "../src/routes/chat-history.js";

describe("parseChatSessionMessagesPath (unit)", () => {
  it("parses session ids including encoded slashes", () => {
    expect(parseChatSessionMessagesPath("/chat/sessions/s/messages")).toBe("s");
    expect(
      parseChatSessionMessagesPath("/chat/sessions/id%2Fwith%2Fslash/messages"),
    ).toBe("id/with/slash");
  });

  it("returns null for non-history paths", () => {
    expect(parseChatSessionMessagesPath("/chat/ws")).toBeNull();
    expect(parseChatSessionMessagesPath("/chat/sessions/x/history")).toBeNull();
  });
});
