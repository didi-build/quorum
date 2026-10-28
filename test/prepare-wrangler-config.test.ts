import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  D1_PLACEHOLDER_PRODUCTION,
  WRANGLER_CI_CONFIG,
} from "../scripts/lib/wrangler-placeholders.mjs";

const PREPARE_SCRIPT = "scripts/prepare-wrangler-config.mjs";
const FAKE_ID = "11111111-2222-4333-8444-555555555555";

const tempPaths: string[] = [];
const tempDirs: string[] = [];
const repoRootEscapeOutputs: string[] = [];

function trackRepoRootEscapeOutput(resolvedOutputPath: string) {
  repoRootEscapeOutputs.push(resolvedOutputPath);
}

function runPrepare(outputPath: string, env: Record<string, string | undefined> = {}) {
  return spawnSync("node", [PREPARE_SCRIPT, "--output", outputPath], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function assertPrepareRejectedOutsideRepoRoot(
  outputArg: string,
  resolvedOutputPath: string,
  options?: { assertOutputMissing?: boolean },
) {
  const result = runPrepare(outputArg, {
    QUORUM_D1_DATABASE_ID: FAKE_ID,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("directly in the repository root");
  expect(result.stdout).not.toContain(FAKE_ID);
  expect(result.stderr).not.toContain(FAKE_ID);
  if (options?.assertOutputMissing !== false) {
    expect(existsSync(resolvedOutputPath)).toBe(false);
  }
}

afterEach(() => {
  for (const path of tempPaths) {
    rmSync(path, { force: true });
  }
  tempPaths.length = 0;
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  for (const path of repoRootEscapeOutputs) {
    rmSync(path, { force: true });
  }
  repoRootEscapeOutputs.length = 0;
  rmSync(resolve(process.cwd(), "scripts/wrangler.ci.jsonc"), { force: true });
});

describe("prepare-wrangler-config (unit)", () => {
  it("fails when QUORUM_D1_DATABASE_ID is missing", () => {
    const outputPath = join(process.cwd(), WRANGLER_CI_CONFIG);
    tempPaths.push(outputPath);
    const result = runPrepare(outputPath, { QUORUM_D1_DATABASE_ID: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing QUORUM_D1_DATABASE_ID");
  });

  it("fails when QUORUM_D1_DATABASE_ID is the committed placeholder", () => {
    const outputPath = join(
      process.cwd(),
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
    );
    tempPaths.push(outputPath);
    const result = runPrepare(outputPath, {
      QUORUM_D1_DATABASE_ID: D1_PLACEHOLDER_PRODUCTION,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not be the committed placeholder");
  });

  it("refuses --output wrangler.jsonc (source config path)", () => {
    const result = runPrepare("wrangler.jsonc", {
      QUORUM_D1_DATABASE_ID: FAKE_ID,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not overwrite the committed wrangler.jsonc");
    expect(readFileSync("wrangler.jsonc", "utf8")).toContain(D1_PLACEHOLDER_PRODUCTION);
  });

  it("refuses --output wrangler.prod.jsonc (not wrangler*.ci.jsonc)", () => {
    const outputPath = join(process.cwd(), "wrangler.prod.jsonc");
    tempPaths.push(outputPath);
    const result = runPrepare(outputPath, {
      QUORUM_D1_DATABASE_ID: FAKE_ID,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wrangler*.ci.jsonc");
    expect(result.stderr).not.toContain(FAKE_ID);
  });

  describe("refuses output outside the repository root", () => {
    it("rejects --output ../wrangler.ci.jsonc", () => {
      const resolved = resolve(process.cwd(), "..", "wrangler.ci.jsonc");
      const existedBefore = existsSync(resolved);
      try {
        assertPrepareRejectedOutsideRepoRoot("../wrangler.ci.jsonc", resolved, {
          assertOutputMissing: false,
        });
      } finally {
        if (!existedBefore && existsSync(resolved)) {
          trackRepoRootEscapeOutput(resolved);
        }
      }
    });

    it("rejects an absolute path outside the repository root", () => {
      const dir = mkdtempSync(join(tmpdir(), "quorum-prepare-out-"));
      tempDirs.push(dir);
      const absoluteOutput = join(dir, "wrangler.ci.jsonc");
      assertPrepareRejectedOutsideRepoRoot(absoluteOutput, absoluteOutput);
    });

    it("rejects --output scripts/wrangler.ci.jsonc", () => {
      const resolved = resolve(process.cwd(), "scripts/wrangler.ci.jsonc");
      assertPrepareRejectedOutsideRepoRoot("scripts/wrangler.ci.jsonc", resolved);
    });
  });

  it("writes a gitignored wrangler*.ci.jsonc config when env is valid", () => {
    const outputPath = join(
      process.cwd(),
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
    );
    tempPaths.push(outputPath);
    const result = runPrepare(outputPath, {
      QUORUM_D1_DATABASE_ID: FAKE_ID,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(FAKE_ID);
    expect(result.stderr).not.toContain(FAKE_ID);
    expect(readFileSync(outputPath, "utf8")).toContain(FAKE_ID);
    expect(readFileSync(outputPath, "utf8")).not.toContain(D1_PLACEHOLDER_PRODUCTION);
  });
});
