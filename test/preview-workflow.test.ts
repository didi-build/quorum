import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github/workflows/preview.yml");
const workflow = readFileSync(workflowPath, "utf8");

const USES_RE = /^\s*- uses:\s+(.+)$/gm;
const PINNED_USES_RE = /^[^\s@]+\/[^\s@]+@[0-9a-f]{40}(\s+#\s*.+)?$/;

function extractJobBlock(yaml: string, jobId: string): string {
  const marker = `  ${jobId}:`;
  const start = yaml.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const rest = yaml.slice(start + marker.length);
  const nextJob = rest.search(/\n {2}[a-z][a-z0-9_-]*:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

/** @returns {string[]} every `uses:` target in the given workflow YAML fragment */
export function collectActionUsesLines(text: string): string[] {
  const uses: string[] = [];
  for (const match of text.matchAll(USES_RE)) {
    uses.push(match[1].trim());
  }
  return uses;
}

/** @returns {string[]} uses lines that are not pinned to a 40-character commit SHA */
export function findUnpinnedActionUses(text: string): string[] {
  return collectActionUsesLines(text).filter((line) => !PINNED_USES_RE.test(line));
}

describe("preview.yml workflow structure (unit)", () => {
  it("defines a screenshots job with Playwright capture and artifact upload", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).toContain("name: mock-preview screenshots");
    expect(screenshots).toContain("Capture UI screenshots");
    expect(screenshots).toContain("node scripts/capture-preview-screenshots.mjs");
    expect(screenshots).toContain("npx playwright install --with-deps chromium");
    expect(screenshots).toContain("name: quorum-mock-preview-screenshots");
    expect(screenshots).toContain("npm ci --ignore-scripts");
    expect(screenshots).toContain("if-no-files-found: error");
    expect(screenshots).toContain("Verify screenshot count");
  });

  it("keeps Cloudflare preview secrets out of the screenshots job", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_ACCOUNT_ID");
    expect(screenshots).not.toContain("secrets.");
  });

  it("pins every action uses line in preview.yml", () => {
    const unpinned = findUnpinnedActionUses(workflow);
    expect(unpinned).toEqual([]);
  });

  it("fails pin validation when a uses line is not pinned to a commit SHA", () => {
    const fixture = `
jobs:
  example:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
`;
    expect(findUnpinnedActionUses(fixture)).toEqual(["actions/checkout@v4"]);
  });

  it("links screenshot artifact URL from upload-artifact in the sticky preview comment", () => {
    const comment = extractJobBlock(workflow, "comment");
    expect(comment).toContain("needs.screenshots.outputs.artifact_url");
    expect(comment).toContain("SCREENSHOT_ARTIFACT_URL");
    expect(comment).toContain("body-file: preview-comment.md");
  });

  it("runs screenshots when build succeeds even if deploy fails", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).toContain("always()");
    expect(screenshots).toContain("needs.build.result == 'success'");
  });

  it("posts the sticky comment when deploy succeeds regardless of screenshots", () => {
    const comment = extractJobBlock(workflow, "comment");
    expect(comment).toContain("!cancelled()");
    expect(comment).toContain("needs.deploy.result == 'success'");
    expect(comment).toContain('SCREENSHOTS_RESULT" = "success"');
    expect(comment).not.toContain("always()");
  });

  it("keeps same-repo fork guard on screenshots", () => {
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });
});
