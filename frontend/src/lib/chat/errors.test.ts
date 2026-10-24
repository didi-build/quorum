import { describe, expect, it } from "vitest";
import {
  CHAT_GENERIC_ERROR_MESSAGE,
  genericChatError,
  toChatUserMessage,
  userFacingChatError,
} from "./errors";

describe("toChatUserMessage", () => {
  it("maps 5xx API errors to the generic spec sentence", () => {
    expect(toChatUserMessage(userFacingChatError(500))).toBe(
      CHAT_GENERIC_ERROR_MESSAGE,
    );
    expect(toChatUserMessage(userFacingChatError(503, "upstream"))).toBe(
      CHAT_GENERIC_ERROR_MESSAGE,
    );
  });

  it("maps raw fetch failures to the generic spec sentence", () => {
    expect(toChatUserMessage(new TypeError("Failed to fetch"))).toBe(
      CHAT_GENERIC_ERROR_MESSAGE,
    );
  });

  it("maps generic chat errors from send failures", () => {
    expect(toChatUserMessage(genericChatError())).toBe(CHAT_GENERIC_ERROR_MESSAGE);
  });
});
