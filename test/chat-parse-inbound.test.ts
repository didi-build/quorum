import { describe, expect, it } from "vitest";
import {
  CHAT_CONTENT_MAX_BYTES,
  CHAT_SESSION_ID_PATTERN,
  parseChatMessageIn,
  ChatInboundParseError,
} from "../src/domain/chat/parse-inbound.js";

describe("parseChatMessageIn (unit)", () => {
  it("accepts valid session_id and content", () => {
    const payload = parseChatMessageIn(
      JSON.stringify({ session_id: "thread-1", content: "Hello" }),
    );
    expect(payload.session_id).toBe("thread-1");
  });

  it("rejects malformed JSON", () => {
    expect(() => parseChatMessageIn("{")).toThrow(ChatInboundParseError);
  });

  it("rejects session_id outside the allowed pattern", () => {
    expect(() =>
      parseChatMessageIn(JSON.stringify({ session_id: "bad/id", content: "Hi" })),
    ).toThrow(ChatInboundParseError);
    expect(CHAT_SESSION_ID_PATTERN.test("valid_session-1")).toBe(true);
  });

  it("rejects content larger than 32 KB UTF-8", () => {
    const big = "a".repeat(CHAT_CONTENT_MAX_BYTES + 1);
    expect(() =>
      parseChatMessageIn(JSON.stringify({ session_id: "s1", content: big })),
    ).toThrow(ChatInboundParseError);
  });

  it("accepts content of exactly 32768 UTF-8 bytes", () => {
    const content = "a".repeat(CHAT_CONTENT_MAX_BYTES);
    expect(new TextEncoder().encode(content).byteLength).toBe(32768);
    parseChatMessageIn(JSON.stringify({ session_id: "s1", content }));
  });

  it("rejects content of 32769 UTF-8 bytes", () => {
    const content = "a".repeat(CHAT_CONTENT_MAX_BYTES + 1);
    expect(new TextEncoder().encode(content).byteLength).toBe(32769);
    expect(() =>
      parseChatMessageIn(JSON.stringify({ session_id: "s1", content })),
    ).toThrow(ChatInboundParseError);
  });

  it("rejects content over the byte cap when char count is below 32K", () => {
    const emoji = "\u{1F600}";
    const content = emoji.repeat(8193);
    expect(new TextEncoder().encode(content).byteLength).toBeGreaterThan(
      CHAT_CONTENT_MAX_BYTES,
    );
    expect(() =>
      parseChatMessageIn(JSON.stringify({ session_id: "s1", content })),
    ).toThrow(ChatInboundParseError);
  });
});
