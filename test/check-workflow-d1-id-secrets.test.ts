import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  findVarsD1DatabaseIdReference,
  VARS_D1_DATABASE_ID_PATTERN,
} from "../scripts/check-workflow-d1-id-secrets.mjs";

const SCRIPT = "scripts/check-workflow-d1-id-secrets.mjs";

function runGuard(workflowsDir: string) {
  return spawnSync("node", [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, QUORUM_WORKFLOW_POLICY_ROOT: workflowsDir },
  });
}

describe("check-workflow-d1-id-secrets pattern (unit)", () => {
  it("matches vars references to QUORUM_D1_DATABASE_ID", () => {
    expect("vars.QUORUM_D1_DATABASE_ID".match(VARS_D1_DATABASE_ID_PATTERN)?.[0]).toBe(
      "vars.QUORUM_D1_DATABASE_ID",
    );
    expect(
      findVarsD1DatabaseIdReference("${{ vars['QUORUM_D1_DATABASE_ID'] }}")?.[0],
    ).toBe("vars['QUORUM_D1_DATABASE_ID");
  });

  it("does not match secrets references", () => {
    expect(findVarsD1DatabaseIdReference("secrets.QUORUM_D1_DATABASE_ID")).toBeNull();
  });
});

describe("check-workflow-d1-id-secrets (unit)", () => {
  it("passes on committed workflows", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });

  it("fails when a workflow uses vars for QUORUM_D1_DATABASE_ID", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-d1-mask-"));
    const workflows = join(dir, "workflows");
    mkdirSync(workflows, { recursive: true });
    writeFileSync(
      join(workflows, "bad.yml"),
      `name: Bad
on: push
jobs:
  x:
    steps:
      - env:
          QUORUM_D1_DATABASE_ID: \${{ vars.QUORUM_D1_DATABASE_ID }}
        run: echo ok
`,
      "utf8",
    );
    const result = runGuard(workflows);
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bad.yml");
  });
});
