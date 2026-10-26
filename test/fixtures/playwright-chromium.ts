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

export const PLAYWRIGHT_CHROMIUM_INTEGRATION_SKIP_REASON =
  "Playwright Chromium is not installed in this environment; end-to-end capture runs in preview.yml screenshots job";
