import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github/workflows/preview.yml");
const workflow = readFileSync(workflowPath, "utf8");

const PIN_RE = /uses:\s+([^@\s]+)@([0-9a-f]{40})\s+#\s*(v[^\s]+)/g;

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

function collectPins(text: string) {
  const pins: { repo: string; pin: string; tag: string }[] = [];
  for (const match of text.matchAll(PIN_RE)) {
    pins.push({ repo: match[1], pin: match[2], tag: match[3] });
  }
  return pins;
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
  });

  it("keeps Cloudflare preview secrets out of the screenshots job", () => {
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW");
    expect(screenshots).not.toContain("QUORUM_CLOUDFLARE_ACCOUNT_ID");
    expect(screenshots).not.toContain("secrets.");
  });

  it("pins every action in the screenshots and comment jobs", () => {
    for (const jobId of ["screenshots", "comment"]) {
      const block = extractJobBlock(workflow, jobId);
      const pins = collectPins(block);
      expect(pins.length).toBeGreaterThan(0);
      for (const { pin } of pins) {
        expect(pin).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it("links screenshot artifacts from the sticky preview comment", () => {
    const comment = extractJobBlock(workflow, "comment");
    expect(comment).toContain("quorum-mock-preview-screenshots");
    expect(comment).toContain("WORKFLOW_RUN_URL");
    expect(comment).toContain("body-file: preview-comment.md");
  });

  it("keeps same-repo fork guard on screenshots", () => {
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    const screenshots = extractJobBlock(workflow, "screenshots");
    expect(screenshots).toContain(
      "if: github.event.pull_request.head.repo.full_name == github.repository",
    );
  });
});
