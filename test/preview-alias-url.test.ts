import { describe, expect, it } from "vitest";
import {
  PREVIEW_ALIAS_URL_MISSING_MESSAGE,
  PREVIEW_WORKER_MISSING_MESSAGE,
  classifyPreviewUploadResult,
  extractPreviewAliasUrl,
  isPreviewWorkerMissingOutput,
  previewAppEntryUrl,
} from "../scripts/lib/preview-alias-url.mjs";

const SAMPLE_SUCCESS = `
 ⛅️ wrangler 4.152.0
────────────────────
Total Upload: 12.34 KiB / gzip: 4.56 KiB
Uploaded quorum-preview (Version ID: 00000000-0000-0000-0000-000000000099)
Version Preview URL: https://a1b2c3d4-quorum-preview.example-subdomain.workers.dev
Version Preview Alias URL: https://pr-42-quorum-preview.example-subdomain.workers.dev
`;

const SAMPLE_VERSION_URL_ONLY = `
Version Preview URL: https://a1b2c3d4-quorum-preview.example-subdomain.workers.dev
`;

const SAMPLE_WORKER_NOT_FOUND = `
✘ ERROR  A request to the Cloudflare API failed.

  Could not find Worker "quorum-preview". [code: 10007]

  If you think this is a bug, please open an issue.
`;

describe("extractPreviewAliasUrl", () => {
  it("returns only the pr-<n>-quorum-preview alias URL when both alias and version URLs are present", () => {
    const url = extractPreviewAliasUrl(SAMPLE_SUCCESS, "42");
    expect(url).toBe("https://pr-42-quorum-preview.example-subdomain.workers.dev");
  });

  it("returns null when the alias URL is missing", () => {
    expect(extractPreviewAliasUrl(SAMPLE_VERSION_URL_ONLY, "42")).toBeNull();
  });

  it("does not match a version URL that lacks the pr-<n> prefix", () => {
    const output =
      "Preview: https://a1b2c3d4-quorum-preview.example-subdomain.workers.dev";
    expect(extractPreviewAliasUrl(output, "42")).toBeNull();
  });
});

describe("previewAppEntryUrl", () => {
  it("appends /app/ to the alias host URL", () => {
    expect(
      previewAppEntryUrl("https://pr-7-quorum-preview.example-subdomain.workers.dev"),
    ).toBe("https://pr-7-quorum-preview.example-subdomain.workers.dev/app/");
  });
});

describe("preview upload failure classification", () => {
  it("detects a missing quorum-preview Worker from sanitized wrangler output", () => {
    expect(isPreviewWorkerMissingOutput(SAMPLE_WORKER_NOT_FOUND)).toBe(true);
    expect(classifyPreviewUploadResult(1, SAMPLE_WORKER_NOT_FOUND)).toBe(
      "missing_worker",
    );
  });

  it("uses a fixed message constant for the missing Worker case", () => {
    expect(PREVIEW_WORKER_MISSING_MESSAGE).toContain(
      "wrangler deploy --config wrangler.preview.jsonc",
    );
    expect(PREVIEW_WORKER_MISSING_MESSAGE).not.toContain("10007");
  });

  it("uses a fixed message constant when the alias URL is absent", () => {
    expect(PREVIEW_ALIAS_URL_MISSING_MESSAGE).toContain("pr-<n>-quorum-preview");
  });
});
