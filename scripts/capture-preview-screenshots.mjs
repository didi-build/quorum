#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startLandingStaticServer,
  startMockPreviewStaticServer,
} from "./lib/mock-preview-static-server.mjs";
import {
  expectedPreviewScreenshotCount,
  PREVIEW_SCREENSHOT_CAPTURE_SOURCE_FILE,
  PREVIEW_SCREENSHOT_COLOR_SCHEMES,
  PREVIEW_SCREENSHOT_ROUTES,
  PREVIEW_SCREENSHOT_VIEWPORTS,
  previewScreenshotRouteOrigin,
  previewWorkerOriginFromBaseUrl,
} from "./lib/preview-screenshot-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "frontend", "dist-preview");
const landingRoot = path.join(root, "landing");
const outDir = process.env.PREVIEW_SCREENSHOTS_DIR
  ? path.resolve(process.env.PREVIEW_SCREENSHOTS_DIR)
  : path.join(root, "preview-screenshots");

/** @type {'deployed' | 'local-static-server'} */
let captureSource = "local-static-server";

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

function writeCaptureSource() {
  fs.writeFileSync(
    path.join(outDir, PREVIEW_SCREENSHOT_CAPTURE_SOURCE_FILE),
    `${captureSource}\n`,
    "utf8",
  );
}

function isPreviewProbeReady(response) {
  return (
    response.ok ||
    response.status === 301 ||
    response.status === 302 ||
    response.status === 307 ||
    response.status === 308
  );
}

async function waitForServer(origin, probes) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const probe of probes) {
      try {
        const response = await fetch(probe, { redirect: "manual" });
        if (isPreviewProbeReady(response)) {
          return;
        }
      } catch {
        // retry other probes
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for preview server at ${origin}`);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('./lib/preview-screenshot-plan.mjs').PreviewScreenshotRoute} route
 */
async function waitForRouteReady(page, route) {
  switch (route.name) {
    case "landing":
      await page
        .getByRole("heading", { name: /Three seats debate/i })
        .waitFor({ timeout: 30_000 });
      return;
    case "sign-in":
      await page
        .getByRole("heading", { name: "Sign in to Quorum" })
        .waitFor({ timeout: 30_000 });
      return;
    case "chat":
      await page
        .getByRole("navigation", { name: "Sections" })
        .getByRole("link", { name: "Chat" })
        .waitFor({ timeout: 30_000 });
      return;
    case "connections":
      await page
        .getByRole("navigation", { name: "Sections" })
        .getByRole("link", { name: "Connections" })
        .waitFor({ timeout: 30_000 });
      return;
    default:
      throw new Error(`Unknown preview screenshot route: ${route.name}`);
  }
}

async function captureScreenshots(landingOrigin, previewOrigin) {
  const browser = await chromium.launch();
  try {
    for (const route of PREVIEW_SCREENSHOT_ROUTES) {
      const routeOrigin = previewScreenshotRouteOrigin(
        route,
        landingOrigin,
        previewOrigin,
      );
      for (const viewport of PREVIEW_SCREENSHOT_VIEWPORTS) {
        for (const colorScheme of PREVIEW_SCREENSHOT_COLOR_SCHEMES) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme,
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          await page.emulateMedia({ reducedMotion: "reduce" });
          const target = new URL(route.path, `${routeOrigin}/`).toString();
          await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });
          await waitForRouteReady(page, route);
          const fileName = `${route.name}-${viewport.name}-${colorScheme}.png`;
          await page.screenshot({
            path: path.join(outDir, fileName),
            fullPage: true,
            animations: "disabled",
          });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

function assertExpectedScreenshotCount() {
  const expected = expectedPreviewScreenshotCount();
  const count = fs.readdirSync(outDir).filter((name) => name.endsWith(".png")).length;
  if (count !== expected) {
    throw new Error(
      `Expected ${expected} preview screenshots, found ${count} in ${outDir}`,
    );
  }
}

async function main() {
  if (!fs.existsSync(distRoot)) {
    console.error(`capture-preview-screenshots: missing ${distRoot}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(landingRoot, "index.html"))) {
    console.error(`capture-preview-screenshots: missing ${landingRoot}/index.html`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const landingServer = await startLandingStaticServer({ root: landingRoot });
  const landingOrigin = landingServer.baseUrl;
  await waitForServer(landingOrigin, [
    `${landingOrigin}/`,
    `${landingOrigin}/style.css`,
  ]);

  const configuredBase = normalizeBaseUrl(process.env.PREVIEW_BASE_URL);
  let previewOrigin = configuredBase
    ? previewWorkerOriginFromBaseUrl(configuredBase)
    : null;
  /** @type {{ close(): Promise<void> } | null} */
  let previewServer = null;

  const startLocalPreviewServer = async () => {
    previewServer = await startMockPreviewStaticServer({ distRoot });
    previewOrigin = previewServer.baseUrl;
    captureSource = "local-static-server";
    process.stderr.write(
      `capture-preview-screenshots: using local static server at ${previewOrigin}\n`,
    );
  };

  const runCapture = async () => {
    await waitForServer(previewOrigin, [
      `${previewOrigin}/app/`,
      `${previewOrigin}/`,
      `${previewOrigin}/index.html`,
    ]);
    await captureScreenshots(landingOrigin, previewOrigin);
    assertExpectedScreenshotCount();
    writeCaptureSource();
  };

  try {
    if (!previewOrigin) {
      await startLocalPreviewServer();
      await runCapture();
    } else {
      captureSource = "deployed";
      process.stderr.write(
        `capture-preview-screenshots: using deployed preview worker origin ${previewOrigin}\n`,
      );
      try {
        await runCapture();
      } catch (deployedError) {
        const message =
          deployedError instanceof Error
            ? deployedError.message
            : String(deployedError);
        process.stderr.write(
          `capture-preview-screenshots: deployed preview failed (${message}); falling back to local dist\n`,
        );
        fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });
        await startLocalPreviewServer();
        await runCapture();
      }
    }
  } finally {
    await landingServer.close();
    if (previewServer) {
      await previewServer.close();
    }
  }

  const count = fs.readdirSync(outDir).filter((name) => name.endsWith(".png")).length;
  process.stderr.write(
    `capture-preview-screenshots: wrote ${count} PNG files to ${outDir} (source=${captureSource})\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
