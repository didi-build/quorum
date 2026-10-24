import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "frontend", "dist");
const sentinel = "quorum-mock-preview-sentinel-v1";
const transportLabel = "quorum-mock-preview-transport-v1";

const buildEnv = {
  ...process.env,
  NODE_ENV: "production",
};

function readAllJsUnder(dir: string): string {
  if (!fs.existsSync(dir)) {
    return "";
  }
  const chunks: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chunks.push(readAllJsUnder(full));
      continue;
    }
    if (entry.isFile() && /\.(js|mjs)$/i.test(entry.name)) {
      chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

function distHasServiceWorker(): boolean {
  const candidates = [
    path.join(distRoot, "app", "sw.js"),
    path.join(distRoot, "app", "registerSW.js"),
    path.join(distRoot, "sw.js"),
  ];
  return candidates.some((file) => fs.existsSync(file));
}

describe("frontend mock-preview build (integration)", () => {
  it("production excludes mocks (with service worker); mock-preview includes mocks (no service worker)", () => {
    execSync("npm run build:frontend", { cwd: root, stdio: "pipe", env: buildEnv });
    const productionBundle = readAllJsUnder(distRoot);
    expect(productionBundle).not.toContain(sentinel);
    expect(productionBundle).not.toContain(transportLabel);
    expect(distHasServiceWorker()).toBe(true);

    const swPath = path.join(distRoot, "app", "sw.js");
    if (fs.existsSync(swPath)) {
      expect(fs.readFileSync(swPath, "utf8")).not.toContain(sentinel);
    }

    execSync("npm run build:frontend:mock-preview", {
      cwd: root,
      stdio: "pipe",
      env: buildEnv,
    });
    const previewBundle = readAllJsUnder(distRoot);
    expect(previewBundle).toContain(sentinel);
    expect(previewBundle).toContain(transportLabel);
    expect(distHasServiceWorker()).toBe(false);
  });
});
