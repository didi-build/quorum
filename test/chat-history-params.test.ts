import { describe, expect, it } from "vitest";
import {
  parseChatSessionMessagesPath,
  parseChatSessionMessagesPathResult,
  parseHistoryLimitParam,
} from "../src/routes/chat-history.js";
import { decodeHistoryCursor } from "../src/domain/chat/service.js";

describe("parseChatSessionMessagesPath (unit)", () => {
  it("parses valid session ids", () => {
    expect(parseChatSessionMessagesPath("/chat/sessions/s/messages")).toBe("s");
    expect(parseChatSessionMessagesPath("/chat/sessions/thread-1/messages")).toBe(
      "thread-1",
    );
  });

  it("returns null for non-history paths", () => {
    expect(parseChatSessionMessagesPath("/chat/ws")).toBeNull();
    expect(parseChatSessionMessagesPath("/chat/sessions/x/history")).toBeNull();
  });

  it("marks invalid percent-encoding as bad request", () => {
    expect(
      parseChatSessionMessagesPathResult("/chat/sessions/%E0%A4%A/messages"),
    ).toEqual({ kind: "bad_request" });
  });

  it("marks session ids outside the allowed pattern as bad request", () => {
    expect(
      parseChatSessionMessagesPathResult("/chat/sessions/id%2Fwith%2Fslash/messages"),
    ).toEqual({ kind: "bad_request" });
  });
});

describe("parseHistoryLimitParam (unit)", () => {
  it("defaults when limit is omitted", () => {
    expect(parseHistoryLimitParam(null)).toBe(50);
  });

  it("accepts integers from 1 to 100", () => {
    expect(parseHistoryLimitParam("1")).toBe(1);
    expect(parseHistoryLimitParam("100")).toBe(100);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(parseHistoryLimitParam("0")).toBe("invalid");
    expect(parseHistoryLimitParam("101")).toBe("invalid");
    expect(parseHistoryLimitParam("1000")).toBe("invalid");
    expect(parseHistoryLimitParam("10.5")).toBe("invalid");
    expect(parseHistoryLimitParam("nope")).toBe("invalid");
  });
});

describe("decodeHistoryCursor (unit)", () => {
  it("returns null when the cursor does not decode", () => {
    expect(decodeHistoryCursor("not-a-valid-cursor")).toBeNull();
  });
});
