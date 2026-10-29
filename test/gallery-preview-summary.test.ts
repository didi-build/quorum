import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runSummary(env: Record<string, string>) {
  return execFileSync("node", ["scripts/gallery-preview-summary.mjs"], {
    encoding: "utf8",
    env: { ...process.env, OUTPUT_MODE: "body", ...env },
  });
}

describe("gallery-preview-summary (unit)", () => {
  it("includes marker and gallery link when deployed", () => {
    const body = runSummary({
      PREVIEW_MODE: "deployed",
      PREVIEW_URL: "https://pr-1-quorum-preview.example.workers.dev/app/",
      PR_HEAD_SHA: "abc1234567890",
    });
    expect(body).toContain("<!-- quorum-gallery-preview -->");
    expect(body).toContain("/gallery/");
    expect(body).toContain("abc1234");
  });

  it("explains unconfigured previews", () => {
    const body = runSummary({
      PREVIEW_MODE: "unconfigured",
      PREVIEW_URL: "",
      PR_HEAD_SHA: "abc1234567890",
    });
    expect(body).toContain("QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW");
  });
});
