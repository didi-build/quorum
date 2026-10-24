import { afterEach, describe, expect, it } from "vitest";
import { getOrCreateSessionId } from "./session";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("getOrCreateSessionId", () => {
  it("reuses the tab session id from sessionStorage without localStorage", () => {
    sessionStorage.setItem("quorum.chat.session_id", "session-abc");
    expect(getOrCreateSessionId()).toBe("session-abc");
    expect(localStorage.getItem("quorum.chat.session_id")).toBeNull();
  });

  it("creates a new id in sessionStorage when missing", () => {
    const id = getOrCreateSessionId();
    expect(sessionStorage.getItem("quorum.chat.session_id")).toBe(id);
    expect(localStorage.getItem("quorum.chat.session_id")).toBeNull();
  });
});
