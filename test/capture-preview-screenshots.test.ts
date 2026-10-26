import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expectedPreviewScreenshotCount } from "../scripts/lib/preview-screenshot-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("capture-preview-screenshots (integration)", () => {
  it(
    "writes the expected PNG set from dist-preview and repo landing",
    { timeout: 300_000 },
    () => {
      execSync("npm run build:frontend:mock-preview", {
        cwd: root,
        stdio: "pipe",
        env: process.env,
      });

      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-preview-shots-"));
      try {
        execSync("node scripts/capture-preview-screenshots.mjs", {
          cwd: root,
          stdio: "pipe",
          env: (() => {
            const env = { ...process.env, PREVIEW_SCREENSHOTS_DIR: outDir };
            delete env.PREVIEW_BASE_URL;
            return env;
          })(),
        });
        const pngs = fs.readdirSync(outDir).filter((name) => name.endsWith(".png"));
        expect(pngs).toHaveLength(expectedPreviewScreenshotCount());
        expect(pngs).toContain("landing-390-light.png");
        expect(pngs).toContain("connections-1280-dark.png");
        expect(
          fs.readFileSync(path.join(outDir, "capture-source.txt"), "utf8").trim(),
        ).toBe("local-static-server");
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    },
  );
});
