import { describe, expect, it } from "vitest";
import {
  matchPreviewRedirect,
  withPreviewStaticHeaders,
} from "../scripts/lib/mock-preview-static-meta.mjs";
import {
  MOCK_PREVIEW_HEADERS,
  MOCK_PREVIEW_REDIRECTS,
} from "../scripts/lib/mock-preview-static.mjs";

describe("mock-preview static meta", () => {
  it("parses redirect and header fixtures from dist-preview finish output", () => {
    const redirectLine = MOCK_PREVIEW_REDIRECTS.trim().split(/\s+/);
    expect(redirectLine).toEqual(["/", "/app/", "302"]);
    expect(MOCK_PREVIEW_HEADERS).toContain("X-Robots-Tag: noindex, nofollow");
  });

  it("matches preview redirects and merges global headers", () => {
    const matched = matchPreviewRedirect("/", "http://127.0.0.1:4173", [
      { from: "/", to: "/app/", status: 302 },
    ]);
    expect(matched?.status).toBe(302);
    expect(matched?.location).toBe("http://127.0.0.1:4173/app/");
    const response = withPreviewStaticHeaders(
      { status: 200, headers: { "Content-Type": "text/html" }, body: null },
      { "X-Robots-Tag": "noindex, nofollow" },
    );
    expect(response.headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });
});
