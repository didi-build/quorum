import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const junitPath = path.join(root, "test-results", "junit.xml");
const workerJunitPath = path.join(root, "test-results", "worker-junit.xml");

function runSummary(env: Record<string, string>) {
  const out = execFileSync("node", ["scripts/ci-test-summary.mjs"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const match = out.match(/body<<EOF\n([\s\S]*?)\nEOF/);
  return match?.[1] ?? "";
}

describe("ci-test-summary (unit)", () => {
  it("reports install failure clearly for Dependabot-style CI", () => {
    const body = runSummary({
      INSTALL_OUTCOME: "failure",
      CHECK_OUTCOME: "skipped",
      PR_HEAD_SHA: "abcdef1234567890",
    });
    expect(body).toContain("<!-- launchpad-vitest-results -->");
    expect(body).toContain("npm ci");
    expect(body).toContain("dependency install failed");
    expect(body).toContain("`abcdef1`");
    expect(body).not.toContain("Vitest");
  });

  it("includes check outcome when install succeeds", () => {
    mkdirSync(path.dirname(junitPath), { recursive: true });
    writeFileSync(
      junitPath,
      '<?xml version="1.0"?><testsuites tests="10" failures="0" errors="0"></testsuites>',
    );
    writeFileSync(
      workerJunitPath,
      '<?xml version="1.0"?><testsuites tests="3" failures="0" errors="0"></testsuites>',
    );
    const body = runSummary({
      INSTALL_OUTCOME: "success",
      CHECK_OUTCOME: "success",
      NODRIFT_OUTCOME: "success",
      WORKER_TESTS_OUTCOME: "success",
      PR_HEAD_SHA: "deadbeef00000000",
    });
    expect(body).toContain("**npm run check**");
    expect(body).toContain("`success`");
    expect(body).toContain("nodrift");
    expect(body).toContain("Worker");
    expect(body).toContain("**Vitest (unit)**: 10/10 passed");
    expect(body).not.toContain("JUnit output missing");
  });
});
