import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "upload-preview-version.mjs");

describe("upload-preview-version.mjs (unit)", () => {
  it("exits 0 with a notice when the preview token is missing", () => {
    const result = spawnSync("node", [script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW: "",
        QUORUM_CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000001",
        PREVIEW_PR_NUMBER: "42",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("::notice::");
    expect(result.stderr).toContain("QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW");
    expect(result.stdout.trim()).toBe("");
  });
});
