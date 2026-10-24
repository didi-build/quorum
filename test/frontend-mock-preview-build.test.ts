import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertNoMockArtifactsInProductionDist,
  listJsFilePathsUnder,
} from "../scripts/lib/frontend-dist-mock-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sentinel = "quorum-mock-preview-sentinel-v1";
const transportLabel = "quorum-mock-preview-transport-v1";

function readAllJsUnder(dir: string): string {
  return listJsFilePathsUnder(dir)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function distHasServiceWorker(distRoot: string): boolean {
  const candidates = [
    path.join(distRoot, "app", "sw.js"),
    path.join(distRoot, "app", "registerSW.js"),
    path.join(distRoot, "sw.js"),
  ];
  return candidates.some((file) => fs.existsSync(file));
}

function runProductionBuild(distDir: string): void {
  execSync("node scripts/sync-public-fonts.mjs", { cwd: root, stdio: "pipe" });
  execSync(
    "NODE_ENV=production npx vite build --config frontend/vite.config.ts --mode production",
    {
      cwd: root,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        QUORUM_FRONTEND_OUT_DIR: distDir,
      },
    },
  );
  execSync("node scripts/finish-frontend-dist.mjs", {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, FRONTEND_DIST: distDir },
  });
}

function runMockPreviewBuild(distDir: string): void {
  execSync("node scripts/sync-public-fonts.mjs", { cwd: root, stdio: "pipe" });
  execSync(
    "NODE_ENV=production npx vite build --config frontend/vite.config.ts --mode mock-preview",
    {
      cwd: root,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        QUORUM_FRONTEND_PREVIEW_OUT_DIR: distDir,
      },
    },
  );
  execSync("node scripts/finish-frontend-dist.mjs", {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, FRONTEND_DIST: distDir },
  });
}

describe("frontend mock-preview build (integration)", () => {
  it(
    "production excludes mocks (with service worker); mock-preview includes mocks (no service worker)",
    { timeout: 120_000 },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-fe-build-"));
      const productionDist = path.join(tmp, "production");
      const previewDist = path.join(tmp, "mock-preview");

      fs.mkdirSync(productionDist, { recursive: true });
      fs.mkdirSync(previewDist, { recursive: true });

      runProductionBuild(productionDist);
      const productionBundle = readAllJsUnder(productionDist);
      expect(productionBundle).not.toContain(sentinel);
      expect(productionBundle).not.toContain(transportLabel);
      expect(distHasServiceWorker(productionDist)).toBe(true);
      assertNoMockArtifactsInProductionDist(productionDist);

      runMockPreviewBuild(previewDist);
      const previewBundle = readAllJsUnder(previewDist);
      expect(previewBundle).toContain(sentinel);
      expect(previewBundle).toContain(transportLabel);
      expect(distHasServiceWorker(previewDist)).toBe(false);

      fs.rmSync(tmp, { recursive: true, force: true });
    },
  );
});
