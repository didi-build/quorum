import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runSummary(env: Record<string, string>) {
  const out = execFileSync("node", ["scripts/ci-test-summary.mjs"], {
    cwd: root,
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
    const tmp = mkdtempSync(path.join(os.tmpdir(), "quorum-ci-summary-"));
    try {
      const junitPath = path.join(tmp, "junit.xml");
      const workerJunitPath = path.join(tmp, "worker-junit.xml");
      writeFileSync(
        junitPath,
        `<?xml version="1.0"?>
<testsuites name="vitest tests" tests="10" failures="0" errors="0" time="1">
  <testsuite name="launchpad" tests="6" failures="0" errors="0" skipped="0" time="1"></testsuite>
  <testsuite name="frontend" tests="4" failures="0" errors="0" skipped="0" time="1"></testsuite>
</testsuites>`,
      );
      writeFileSync(
        workerJunitPath,
        `<?xml version="1.0"?>
<testsuites name="vitest tests" tests="3" failures="0" errors="0" time="1">
  <testsuite name="worker" tests="3" failures="0" errors="0" skipped="0" time="1"></testsuite>
</testsuites>`,
      );
      const body = runSummary({
        INSTALL_OUTCOME: "success",
        CHECK_OUTCOME: "success",
        NODRIFT_OUTCOME: "success",
        WORKER_TESTS_OUTCOME: "success",
        PR_HEAD_SHA: "deadbeef00000000",
        UNIT_JUNIT_PATH: junitPath,
        WORKER_JUNIT_PATH: workerJunitPath,
      });
      expect(body).toContain("**npm run check**");
      expect(body).toContain("`success`");
      expect(body).toContain("nodrift");
      expect(body).toContain("Worker");
      expect(body).toContain("**Vitest (unit)**: 10/10 passed");
      expect(body).toContain("**Vitest (Worker, vitest-pool-workers)**: 3/3 passed");
      expect(body).not.toContain("JUnit output missing");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports skipped tests separately instead of counting them as passed", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "quorum-ci-summary-"));
    try {
      const junitPath = path.join(tmp, "junit.xml");
      const workerJunitPath = path.join(tmp, "worker-junit.xml");
      writeFileSync(
        junitPath,
        `<?xml version="1.0"?>
<testsuites name="vitest tests" tests="375" failures="0" errors="0" time="1">
  <testsuite name="launchpad" tests="50" failures="0" errors="0" skipped="0" time="1"></testsuite>
  <testsuite name="frontend" tests="100" failures="0" errors="0" skipped="3" time="1"></testsuite>
  <testsuite name="frontend-components" tests="225" failures="0" errors="0" skipped="1" time="1"></testsuite>
</testsuites>`,
      );
      writeFileSync(
        workerJunitPath,
        `<?xml version="1.0"?>
<testsuites name="vitest tests" tests="5" failures="1" errors="0" time="1">
  <testsuite name="worker-a" tests="2" failures="0" errors="0" skipped="1" time="1"></testsuite>
  <testsuite name="worker-b" tests="3" failures="1" errors="0" skipped="0" time="1"></testsuite>
</testsuites>`,
      );
      const body = runSummary({
        INSTALL_OUTCOME: "success",
        CHECK_OUTCOME: "success",
        NODRIFT_OUTCOME: "success",
        WORKER_TESTS_OUTCOME: "success",
        PR_HEAD_SHA: "0000000000000000",
        UNIT_JUNIT_PATH: junitPath,
        WORKER_JUNIT_PATH: workerJunitPath,
      });
      expect(body).toContain("**Vitest (unit)**: 371 passed, 4 skipped");
      expect(body).not.toContain("(0 failed)");
      expect(body).toContain(
        "**Vitest (Worker, vitest-pool-workers)**: 3 passed, 1 skipped (1 failed)",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
