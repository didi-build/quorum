import { describe, expect, it } from "vitest";
import { parseChatSessionMessagesPath } from "../src/routes/chat-history.js";

describe("parseChatSessionMessagesPath (unit)", () => {
  it("parses valid session ids", () => {
    expect(parseChatSessionMessagesPath("/chat/sessions/s/messages")).toBe("s");
  });

  it("returns null for non-history paths", () => {
    expect(parseChatSessionMessagesPath("/chat/ws")).toBeNull();
    expect(parseChatSessionMessagesPath("/chat/sessions/x/history")).toBeNull();
  });

  it("returns null when the decoded session id fails the pattern", () => {
    expect(
      parseChatSessionMessagesPath("/chat/sessions/id%2Fwith%2Fslash/messages"),
    ).toBeNull();
  });
});
