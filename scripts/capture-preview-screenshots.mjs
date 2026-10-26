#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockPreviewStaticServer } from "./lib/mock-preview-static-server.mjs";
import {
  PREVIEW_SCREENSHOT_COLOR_SCHEMES,
  PREVIEW_SCREENSHOT_ROUTES,
  PREVIEW_SCREENSHOT_VIEWPORTS,
  previewWorkerOriginFromBaseUrl,
} from "./lib/preview-screenshot-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "frontend", "dist-preview");
const outDir = process.env.PREVIEW_SCREENSHOTS_DIR
  ? path.resolve(process.env.PREVIEW_SCREENSHOTS_DIR)
  : path.join(root, "preview-screenshots");

function normalizeBaseUrl(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

async function waitForServer(origin) {
  const probe = `${origin}/index.html`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(probe, { redirect: "manual" });
      if (response.ok || response.status === 302) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for preview server at ${probe}`);
}

async function main() {
  if (!fs.existsSync(distRoot)) {
    console.error(`capture-preview-screenshots: missing ${distRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const configuredBase = normalizeBaseUrl(process.env.PREVIEW_BASE_URL);
  let routeOrigin = configuredBase
    ? previewWorkerOriginFromBaseUrl(configuredBase)
    : null;
  let localServer = null;

  if (!routeOrigin) {
    localServer = await startMockPreviewStaticServer({ distRoot });
    routeOrigin = localServer.baseUrl;
    process.stderr.write(
      `capture-preview-screenshots: using local static server at ${routeOrigin}\n`,
    );
  } else {
    process.stderr.write(
      `capture-preview-screenshots: using deployed preview worker origin ${routeOrigin}\n`,
    );
  }

  await waitForServer(routeOrigin);

  const browser = await chromium.launch();
  try {
    for (const route of PREVIEW_SCREENSHOT_ROUTES) {
      for (const viewport of PREVIEW_SCREENSHOT_VIEWPORTS) {
        for (const colorScheme of PREVIEW_SCREENSHOT_COLOR_SCHEMES) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme,
          });
          const page = await context.newPage();
          const target = new URL(route.path, `${routeOrigin}/`).toString();
          await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });
          await page.waitForSelector(route.readySelector, { timeout: 30_000 });
          const fileName = `${route.name}-${viewport.name}-${colorScheme}.png`;
          await page.screenshot({
            path: path.join(outDir, fileName),
            fullPage: true,
          });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    if (localServer) {
      await localServer.close();
    }
  }

  const count = fs.readdirSync(outDir).filter((name) => name.endsWith(".png")).length;
  process.stderr.write(
    `capture-preview-screenshots: wrote ${count} PNG files to ${outDir}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
