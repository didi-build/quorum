import { chromium } from "@playwright/test";
import fs from "node:fs";

/** True when Playwright's Chromium binary is installed (e.g. after `npx playwright install chromium`). */
export function playwrightChromiumInstalled(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/** Skip the capture integration test only on local machines without Chromium; CI must install browsers and run it. */
export function shouldSkipCapturePreviewIntegrationTest(
  ci: NodeJS.ProcessEnv["CI"] = process.env.CI,
): boolean {
  return !playwrightChromiumInstalled() && !ci;
}

export const PLAYWRIGHT_CHROMIUM_INTEGRATION_SKIP_REASON =
  "Playwright Chromium is not installed locally; run npx playwright install chromium or rely on preview.yml screenshots in CI";

export const PLAYWRIGHT_CHROMIUM_CI_REQUIRED_MESSAGE =
  "Playwright Chromium must be installed in CI (npx playwright install --with-deps chromium in .github/workflows/ci.yml)";
