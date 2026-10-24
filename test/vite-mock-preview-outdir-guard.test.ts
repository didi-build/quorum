import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertNoMockArtifactsInProductionDist } from "../scripts/lib/frontend-dist-mock-scan.mjs";
import {
  assertMockPreviewOutDirNotProductionDist,
  productionFrontendDistDir,
} from "../scripts/lib/frontend-outdir-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(root, "frontend");
const productionDist = productionFrontendDistDir(frontendRoot);

function viteMockPreviewBuild(
  extraArgs: string,
  env: Record<string, string> = {},
): void {
  execSync(
    `NODE_ENV=production npx vite build --config frontend/vite.config.ts --mode mock-preview ${extraArgs}`,
    {
      cwd: root,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        ...env,
      },
    },
  );
}

describe("mock-preview outDir guard", () => {
  it("refuses QUORUM_FRONTEND_PREVIEW_OUT_DIR=dist (production dist path)", () => {
    expect(() => {
      viteMockPreviewBuild("", { QUORUM_FRONTEND_PREVIEW_OUT_DIR: "dist" });
    }).toThrow(/Refusing mock-preview build/);
    const mockChunks = fs.existsSync(path.join(productionDist, "assets"))
      ? fs
          .readdirSync(path.join(productionDist, "assets"))
          .filter((name) => /mockBundle|loadPreviewMocks/i.test(name))
      : [];
    expect(mockChunks).toEqual([]);
  });

  it("refuses vite --outDir dist (production dist path)", () => {
    expect(() => {
      viteMockPreviewBuild("--outDir dist");
    }).toThrow(/Refusing mock-preview build/);
  });

  it("assertMockPreviewOutDirNotProductionDist rejects paths inside frontend/dist", () => {
    expect(() => {
      assertMockPreviewOutDirNotProductionDist(productionDist, frontendRoot);
    }).toThrow(/Refusing mock-preview build/);
  });

  it("production mock scan uses the resolved outDir path (same helper as closeBundle)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-prod-outdir-"));
    const customOut = path.join(tmp, "custom-dist");

    execSync(
      `NODE_ENV=production npx vite build --config frontend/vite.config.ts --mode production --outDir ${JSON.stringify(customOut)}`,
      {
        cwd: root,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production" },
      },
    );

    fs.mkdirSync(path.join(customOut, "assets"), { recursive: true });
    fs.writeFileSync(path.join(customOut, "assets", "mockBundle-evil.js"), "export {}");

    expect(() => {
      assertNoMockArtifactsInProductionDist(customOut);
    }).toThrow(/mock preview artifacts/i);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
