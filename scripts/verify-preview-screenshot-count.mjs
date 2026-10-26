#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedPreviewScreenshotCount } from "./lib/preview-screenshot-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.PREVIEW_SCREENSHOTS_DIR
  ? path.resolve(process.env.PREVIEW_SCREENSHOTS_DIR)
  : path.join(root, "preview-screenshots");

const expected = expectedPreviewScreenshotCount();
const count = fs.existsSync(outDir)
  ? fs.readdirSync(outDir).filter((name) => name.endsWith(".png")).length
  : 0;

if (count !== expected) {
  console.error(
    `verify-preview-screenshot-count: expected ${expected} PNG screenshots, found ${count} in ${outDir}`,
  );
  process.exit(1);
}

console.log(`verify-preview-screenshot-count: ok (${count} PNG files)`);
