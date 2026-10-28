import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findVarsD1DatabaseIdReference } from "../scripts/check-workflow-d1-id-secrets.mjs";
import {
  collectActionUses,
  findLocalActionUses,
  findUnpinnedActionUses,
} from "./lib/workflow-action-pins.js";

const workflowPath = join(process.cwd(), ".github/workflows/deploy-production.yml");
const workflow = readFileSync(workflowPath, "utf8");

function extractDeployJobSection(yaml: string): string {
  return yaml.match(/^ {2}deploy:[\s\S]*$/m)?.[0] ?? "";
}

describe("deploy-production.yml workflow structure (unit)", () => {
  it("is triggered only by push to main and workflow_dispatch", () => {
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toContain("pull_request");
  });

  it("deploy job uses GitHub production environment and main ref guard", () => {
    const deploySection = extractDeployJobSection(workflow);
    expect(deploySection).toMatch(/environment:\s+production/);
    expect(deploySection).toContain("if: github.ref == 'refs/heads/main'");
  });

  it("injects the D1 id from secrets only in the prepare step", () => {
    const deploySection = extractDeployJobSection(workflow);
    const prepareIdx = deploySection.indexOf(
      "Prepare Wrangler config (production D1 id)",
    );
    const prepareBlock = deploySection.slice(prepareIdx, prepareIdx + 600);
    expect(prepareBlock).toContain(
      "QUORUM_D1_DATABASE_ID: ${{ secrets.QUORUM_D1_DATABASE_ID }}",
    );
    expect(findVarsD1DatabaseIdReference(deploySection)).toBeNull();
    const secretRefs = deploySection.match(/secrets\.QUORUM_D1_DATABASE_ID/g) ?? [];
    expect(secretRefs).toHaveLength(1);
  });

  it("runs committed guards, prepare, and production-deploy guards before build", () => {
    const deploySection = extractDeployJobSection(workflow);
    const committedIdx = deploySection.indexOf(
      "Deploy-time guards (committed wrangler.jsonc)",
    );
    const prepareIdx = deploySection.indexOf(
      "Prepare Wrangler config (production D1 id)",
    );
    const deployGuardsIdx = deploySection.indexOf(
      "Deploy-time guards (production deploy config)",
    );
    const buildIdx = deploySection.indexOf("Build frontend and Worker bundle inputs");
    expect(committedIdx).toBeGreaterThan(-1);
    expect(prepareIdx).toBeGreaterThan(committedIdx);
    expect(deployGuardsIdx).toBeGreaterThan(prepareIdx);
    expect(buildIdx).toBeGreaterThan(deployGuardsIdx);
  });

  it("uses persist-credentials false on checkout", () => {
    expect(workflow).toContain("persist-credentials: false");
  });

  it("pins every action uses entry in deploy-production.yml", () => {
    expect(findLocalActionUses(workflow)).toEqual([]);
    expect(findUnpinnedActionUses(workflow)).toEqual([]);
    expect(collectActionUses(workflow).length).toBeGreaterThan(0);
  });

  it("keeps workflow permissions at contents read", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });
});
