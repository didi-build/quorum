#!/usr/bin/env node
/**
 * After Vite build (base /app/): place the SPA under dist/app/ and copy landing to dist/.
 * Set FRONTEND_DIST to the dist directory relative to repo root (default frontend/dist).
 * Mock-preview (QUORUM_FRONTEND_DIST_PROFILE=mock-preview or frontend/dist-preview) skips the
 * landing copy and emits _redirects/_headers instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMockPreviewFrontendDist,
  MOCK_PREVIEW_HEADERS,
  MOCK_PREVIEW_REDIRECTS,
} from "./lib/mock-preview-static.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRel = process.env.FRONTEND_DIST ?? "frontend/dist";
const dist = path.isAbsolute(distRel) ? distRel : path.join(root, distRel);
const appDir = path.join(dist, "app");
const mockPreview = isMockPreviewFrontendDist(distRel, dist);

if (!fs.existsSync(dist)) {
  console.error(`finish-frontend-dist: missing ${distRel} (run vite build first)`);
  process.exit(1);
}

fs.mkdirSync(appDir, { recursive: true });

const moveIntoApp = (name) => {
  const from = path.join(dist, name);
  const to = path.join(appDir, name);
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
  }
};

for (const entry of fs.readdirSync(dist)) {
  if (entry === "app") {
    continue;
  }
  moveIntoApp(entry);
}

if (mockPreview) {
  fs.writeFileSync(path.join(dist, "_redirects"), MOCK_PREVIEW_REDIRECTS, "utf8");
  fs.writeFileSync(path.join(dist, "_headers"), MOCK_PREVIEW_HEADERS, "utf8");
  console.log(
    `finish-frontend-dist: SPA at ${distRel}/app/, preview static _redirects and _headers at ${distRel}/`,
  );
} else {
  const landingDir = path.join(root, "landing");
  for (const name of fs.readdirSync(landingDir)) {
    const from = path.join(landingDir, name);
    if (!fs.statSync(from).isFile()) {
      continue;
    }
    fs.copyFileSync(from, path.join(dist, name));
  }
  console.log(
    `finish-frontend-dist: SPA at ${distRel}/app/, landing at ${distRel}/index.html`,
  );
}
