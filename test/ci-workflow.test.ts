import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github/workflows/ci.yml");
const workflow = readFileSync(workflowPath, "utf8");

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

describe("ci workflow (unit)", () => {
  it("installs Playwright Chromium in the check job after npm ci", () => {
    const check = extractJobBlock(workflow, "check");
    expect(check).toContain("name: npm ci");
    expect(check).toContain("name: Install Playwright Chromium");
    expect(check).toContain("npx playwright install --with-deps chromium");
    const ciIndex = check.indexOf("name: npm ci");
    const playwrightIndex = check.indexOf("name: Install Playwright Chromium");
    const nodriftIndex = check.indexOf("name: nodrift check");
    expect(playwrightIndex).toBeGreaterThan(ciIndex);
    expect(nodriftIndex).toBeGreaterThan(playwrightIndex);
  });
});
