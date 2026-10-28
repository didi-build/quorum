import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseJsonc } from "../scripts/lib/parse-jsonc.mjs";
import { PRODUCTION_RESOURCE_MARKERS } from "../scripts/lib/wrangler-placeholders.mjs";

const GUARD_SCRIPT = "scripts/check-deploy-guards.mjs";
const PREPARE_SCRIPT = "scripts/prepare-wrangler-config.mjs";
const FAKE_ID = "11111111-2222-4333-8444-555555555555";

const tempPaths: string[] = [];

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

function writeTempConfig(
  fileName: string,
  mutator: (config: Record<string, unknown>) => void,
) {
  const base = parseJsonc(readFileSync("wrangler.jsonc", "utf8")) as Record<
    string,
    unknown
  >;
  mutator(base);
  const path = join(process.cwd(), fileName);
  writeFileSync(path, `${JSON.stringify(base, null, 2)}\n`, "utf8");
  tempPaths.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempPaths) {
    rmSync(path, { force: true });
  }
  tempPaths.length = 0;
});

describe("check-deploy-guards (unit)", () => {
  it("passes committed guards on wrangler.jsonc", () => {
    const result = runGuard("committed", "wrangler.jsonc");
    expect(result.status).toBe(0);
  });

  it("fails committed guards when database_id is not the placeholder", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.jsonc`,
      (config) => {
        const rows = config.d1_databases as { database_id?: string }[];
        rows[0].database_id = FAKE_ID;
      },
    );
    const result = runGuard("committed", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("placeholder database_id");
    expect(result.stderr).not.toContain(FAKE_ID);
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
    tempPaths.push(outputPath);
    const prepared = runPrepare(outputPath, {
      QUORUM_D1_DATABASE_ID: FAKE_ID,
    });
    expect(prepared.status).toBe(0);

    const config = parseJsonc(readFileSync(outputPath, "utf8")) as {
      d1_databases?: { database_id?: string }[];
    };
    expect(config.d1_databases?.[0]?.database_id).toBe(FAKE_ID);

    const guarded = runGuard("production-deploy", outputPath);
    expect(guarded.status).toBe(0);
  });

  it("does not print config file content when JSONC parse fails", () => {
    const path = join(process.cwd(), `wrangler.guards-test-${process.pid}.ci.jsonc`);
    tempPaths.push(path);
    writeFileSync(
      path,
      `{
  "name": "${PRODUCTION_RESOURCE_MARKERS.workerName}",
  "d1_databases": [{"binding": "DB", "database_id": "${FAKE_ID}"
`,
      "utf8",
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not valid JSONC");
    expect(result.stderr).not.toContain(FAKE_ID);
    expect(result.stdout).not.toContain(FAKE_ID);
  });

  it("fails when Worker name is wrong", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
      (c) => {
        c.name = "wrong-worker";
        const rows = c.d1_databases as { database_id?: string }[];
        rows[0].database_id = FAKE_ID;
      },
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PRODUCTION_RESOURCE_MARKERS.workerName);
    expect(result.stderr).not.toContain(FAKE_ID);
  });

  it("fails when D1 database_name is wrong", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
      (c) => {
        const rows = c.d1_databases as {
          database_name?: string;
          database_id?: string;
        }[];
        rows[0].database_name = "wrong-db";
        rows[0].database_id = FAKE_ID;
      },
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PRODUCTION_RESOURCE_MARKERS.d1Name);
    expect(result.stderr).not.toContain(FAKE_ID);
  });

  it("fails when indexing queue producer is missing", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
      (c) => {
        c.queues = { producers: [] };
        const rows = c.d1_databases as { database_id?: string }[];
        rows[0].database_id = FAKE_ID;
      },
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PRODUCTION_RESOURCE_MARKERS.queueName);
    expect(result.stderr).not.toContain(FAKE_ID);
  });

  it("fails when vectorize index is missing", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
      (c) => {
        c.vectorize = [];
        const rows = c.d1_databases as { database_id?: string }[];
        rows[0].database_id = FAKE_ID;
      },
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PRODUCTION_RESOURCE_MARKERS.vectorizeIndex);
    expect(result.stderr).not.toContain(FAKE_ID);
  });

  it("fails when D1 binding is missing", () => {
    const path = writeTempConfig(
      `wrangler.guards-test-${process.pid}.ci.jsonc`,
      (c) => {
        c.d1_databases = [
          {
            binding: "OTHER",
            database_name: PRODUCTION_RESOURCE_MARKERS.d1Name,
            database_id: FAKE_ID,
          },
        ];
      },
    );
    const result = runGuard("production-deploy", path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PRODUCTION_RESOURCE_MARKERS.d1Binding);
    expect(result.stderr).not.toContain(FAKE_ID);
  });
});
