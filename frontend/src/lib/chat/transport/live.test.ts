import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveChatTransport } from "./live";

describe("createLiveChatTransport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes the session id in the history URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "s", messages: [] }),
    } as Response);

    await createLiveChatTransport().fetchHistory("id/with/slash");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/chat/sessions/id%2Fwith%2Fslash/messages",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
