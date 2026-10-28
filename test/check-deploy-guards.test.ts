import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseJsonc } from "../scripts/lib/parse-jsonc.mjs";
import { D1_PLACEHOLDER_PRODUCTION } from "../scripts/lib/wrangler-placeholders.mjs";

const GUARD_SCRIPT = "scripts/check-deploy-guards.mjs";
const PREPARE_SCRIPT = "scripts/prepare-wrangler-config.mjs";

const tempDirs: string[] = [];

function runGuard(target: string, configPath: string) {
  return spawnSync("node", [GUARD_SCRIPT, "--target", target, "--config", configPath], {
    encoding: "utf8",
  });
}

function runPrepare(outputPath: string, env: Record<string, string | undefined>) {
  return spawnSync("node", [PREPARE_SCRIPT, "--output", outputPath], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

afterEach(() => {
  for (const path of tempDirs) {
    rmSync(path, { force: true });
  }
  tempDirs.length = 0;
});

describe("check-deploy-guards (unit)", () => {
  it("passes committed guards on wrangler.jsonc", () => {
    const result = runGuard("committed", "wrangler.jsonc");
    expect(result.status).toBe(0);
  });

  it("fails production-deploy guards when the placeholder id would be deployed", () => {
    const result = runGuard("production-deploy", "wrangler.jsonc");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("placeholder D1 database_id");
  });

  it("passes production-deploy guards after prepare substitutes the D1 id", () => {
    const outputPath = join(
      process.cwd(),
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
    );
    tempDirs.push(outputPath);
    const fakeId = "11111111-2222-4333-8444-555555555555";
    const prepared = runPrepare(outputPath, {
      QUORUM_D1_DATABASE_ID: fakeId,
    });
    expect(prepared.status).toBe(0);
    expect(prepared.stdout).not.toContain(fakeId);
    expect(prepared.stderr).not.toContain(fakeId);

    const config = parseJsonc(readFileSync(outputPath, "utf8")) as {
      d1_databases?: { database_id?: string }[];
    };
    expect(config.d1_databases?.[0]?.database_id).toBe(fakeId);
    expect(readFileSync(outputPath, "utf8")).not.toContain(D1_PLACEHOLDER_PRODUCTION);

    const guarded = runGuard("production-deploy", outputPath);
    expect(guarded.status).toBe(0);
  });
});
