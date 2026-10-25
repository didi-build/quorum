#!/usr/bin/env node
/**
 * After Vite build (base /app/): place the SPA under dist/app/ and copy landing to dist/.
 * Set FRONTEND_DIST to the dist directory relative to repo root (default frontend/dist).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRel = process.env.FRONTEND_DIST ?? "frontend/dist";
const dist = path.isAbsolute(distRel) ? distRel : path.join(root, distRel);
const appDir = path.join(dist, "app");

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
