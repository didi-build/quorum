import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github/workflows/preview.yml");
const workflow = readFileSync(workflowPath, "utf8");

/** Matches `uses:` at step or job level, with or without a leading `- `. */
const USES_RE = /^\s*(?:-\s+)?uses:\s*(.+)$/gm;

/** Marketplace actions and reusable workflow refs must pin a 40-character commit SHA after `@`. */
const PINNED_ACTION_REF_RE = /^.+@[0-9a-f]{40}(\s+#.*)?$/;

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

export function normalizeUsesTarget(raw: string): string {
  let target = raw.trim();
  const commentIndex = target.indexOf(" #");
  if (commentIndex !== -1) {
    target = target.slice(0, commentIndex).trim();
  }
  if (
    (target.startsWith('"') && target.endsWith('"')) ||
    (target.startsWith("'") && target.endsWith("'"))
  ) {
    target = target.slice(1, -1);
  }
  return target.trim();
}

/** @returns {string[]} every `uses:` target in the given workflow YAML fragment */
export function collectActionUses(text: string): string[] {
  const uses = [];
  for (const match of text.matchAll(USES_RE)) {
    uses.push(normalizeUsesTarget(match[1]));
  }
  return uses;
}

/** Local composite/workflow paths are not allowed in preview.yml (no SHA pin model). */
export function isLocalActionRef(target: string): boolean {
  return target.startsWith("./") || target.startsWith("../");
}

/** @returns {string[]} local `./` or `../` action references */
export function findLocalActionUses(text: string): string[] {
  return collectActionUses(text).filter(isLocalActionRef);
}

/** @returns {string[]} marketplace action refs that are not pinned to a 40-character commit SHA */
export function findUnpinnedActionUses(text: string): string[] {
  return collectActionUses(text).filter((target) => {
    if (isLocalActionRef(target)) {
      return false;
    }
    return !PINNED_ACTION_REF_RE.test(target);
  });
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
    expect(screenshots).toContain("node scripts/verify-preview-screenshot-count.mjs");
  });

  it("keeps Cloudflare preview secrets out of the screenshots job", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_ACCOUNT_ID");
    expect(screenshots).not.toContain("secrets.");
  });

  it("pins every action uses entry in preview.yml", () => {
    const uses = collectActionUses(workflow);
    expect(uses.length).toBeGreaterThan(0);
    expect(findLocalActionUses(workflow)).toEqual([]);
    expect(findUnpinnedActionUses(workflow)).toEqual([]);
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

  it("fails when uses is on the line after - name (unpinned)", () => {
    const fixture = `
jobs:
  example:
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Upload
        uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
`;
    expect(findUnpinnedActionUses(fixture)).toEqual(["actions/checkout@v4"]);
  });

  it("accepts quoted pinned uses targets", () => {
    const pin = "11d5960a326750d5838078e36cf38b85af677262";
    const fixture = `
jobs:
  example:
    steps:
      - name: Checkout
        uses: "actions/checkout@${pin}" # v4.4.0
`;
    expect(findUnpinnedActionUses(fixture)).toEqual([]);
    expect(findLocalActionUses(fixture)).toEqual([]);
  });

  it("rejects local ./ action paths (checked separately from marketplace pins)", () => {
    const fixture = `
jobs:
  example:
    steps:
      - uses: ./.github/actions/preview-helper
`;
    expect(findLocalActionUses(fixture)).toEqual(["./.github/actions/preview-helper"]);
    expect(findUnpinnedActionUses(fixture)).toEqual([]);
  });

  it("collects job-level uses for reusable workflows", () => {
    const fixture = `
jobs:
  call:
    uses: org/repo/.github/workflows/ci.yml@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`;
    expect(collectActionUses(fixture)).toEqual([
      "org/repo/.github/workflows/ci.yml@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    expect(findUnpinnedActionUses(fixture)).toEqual([]);
  });

  it("links screenshot artifact URL from upload-artifact in the sticky preview comment", () => {
    const comment = extractJobBlock(workflow, "comment");
    expect(comment).toContain("needs.screenshots.outputs.artifact_url");
    expect(comment).toContain("SCREENSHOT_ARTIFACT_URL");
    expect(comment).toContain("body-file: preview-comment.md");
    expect(comment).toContain("honours `_redirects` / `_headers`");
    expect(comment).not.toContain("honours \\`_redirects\\`");
  });

  it("runs screenshots when build succeeds and the workflow was not cancelled", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).toContain(
      "${{ !cancelled() && needs.build.result == 'success' && github.event.pull_request.head.repo.full_name == github.repository }}",
    );
    expect(screenshots).not.toContain("always()");
    expect(screenshots).toContain("needs.build.result == 'success'");
  });

  it("posts the sticky comment when deploy succeeds regardless of screenshots", () => {
    const comment = extractJobBlock(workflow, "comment");
    expect(comment).toContain(
      "${{ !cancelled() && needs.deploy.result == 'success' && github.event.pull_request.head.repo.full_name == github.repository }}",
    );
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

  it("defines gallery probe and gallery-preview check after deploy", () => {
    const galleryProbe = extractJobBlock(workflow, "gallery-probe");
    expect(galleryProbe).toContain("GALLERY_PROBE_MARKER");
    expect(galleryProbe).toContain("name: 'gallery-preview'");
    expect(galleryProbe).toContain("Probe gallery route");
    expect(workflow).toContain("build:frontend:mock-preview");
  });
});
