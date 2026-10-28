import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  D1_PLACEHOLDER_PRODUCTION,
  WRANGLER_CI_CONFIG,
} from "../scripts/lib/wrangler-placeholders.mjs";

const PREPARE_SCRIPT = "scripts/prepare-wrangler-config.mjs";
const FAKE_ID = "11111111-2222-4333-8444-555555555555";

const tempPaths: string[] = [];

function runPrepare(outputPath: string, env: Record<string, string | undefined> = {}) {
  return spawnSync("node", [PREPARE_SCRIPT, "--output", outputPath], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

afterEach(() => {
  for (const path of tempPaths) {
    rmSync(path, { force: true });
  }
  tempPaths.length = 0;
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
