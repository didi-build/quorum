import { describe, expect, it } from "vitest";
import { truncateUtf8ToMaxBytes } from "../src/lib/utf8.js";
import { CHAT_WS_PROBE_ECHO_MAX_BYTES } from "../src/routes/chat-ws.js";

describe("truncateUtf8ToMaxBytes (unit)", () => {
  it("does not split a multi-byte UTF-8 character at the byte cap", () => {
    const max = CHAT_WS_PROBE_ECHO_MAX_BYTES;
    const emoji = "😀";

    const fits = "a".repeat(max - 4) + emoji;
    expect(truncateUtf8ToMaxBytes(fits, max)).toBe(fits);

    const over = "a".repeat(max - 3) + emoji;
    const truncated = truncateUtf8ToMaxBytes(over, max);
    expect(new TextEncoder().encode(truncated).byteLength).toBeLessThanOrEqual(max);
    expect(truncated).toBe("a".repeat(max - 3));
    expect(truncated).not.toContain("\uFFFD");
  });
});
