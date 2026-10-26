import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expectedPreviewScreenshotCount } from "../scripts/lib/preview-screenshot-plan.mjs";
import {
  PLAYWRIGHT_CHROMIUM_CI_REQUIRED_MESSAGE,
  PLAYWRIGHT_CHROMIUM_INTEGRATION_SKIP_REASON,
  playwrightChromiumInstalled,
  shouldSkipCapturePreviewIntegrationTest,
} from "./fixtures/playwright-chromium.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromiumReady = playwrightChromiumInstalled();
const inCi = Boolean(process.env.CI);

const integrationTitle = chromiumReady
  ? "writes the expected PNG set from dist-preview and repo landing"
  : inCi
    ? "requires Playwright Chromium when CI is set"
    : PLAYWRIGHT_CHROMIUM_INTEGRATION_SKIP_REASON;

describe("capture-preview-screenshots (integration)", () => {
  it("skips integration only when Chromium is missing and CI is unset", () => {
    expect(shouldSkipCapturePreviewIntegrationTest("true", true)).toBe(false);
    expect(shouldSkipCapturePreviewIntegrationTest("true", false)).toBe(false);
    expect(shouldSkipCapturePreviewIntegrationTest(undefined, true)).toBe(false);
    expect(shouldSkipCapturePreviewIntegrationTest(undefined, false)).toBe(true);
  });

  it.skipIf(shouldSkipCapturePreviewIntegrationTest())(
    integrationTitle,
    { timeout: 300_000 },
    () => {
      expect(chromiumReady, PLAYWRIGHT_CHROMIUM_CI_REQUIRED_MESSAGE).toBe(true);

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
