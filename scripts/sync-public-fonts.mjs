#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "frontend", "public", "fonts");

const copies = [
  {
    from: "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2",
    to: "geist-sans-latin-400-normal.woff2",
  },
  {
    from: "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2",
    to: "geist-sans-latin-500-normal.woff2",
  },
  {
    from: "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2",
    to: "geist-sans-latin-600-normal.woff2",
  },
  {
    from: "@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2",
    to: "geist-mono-latin-400-normal.woff2",
  },
  {
    from: "@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2",
    to: "geist-mono-latin-500-normal.woff2",
  },
];

fs.mkdirSync(dest, { recursive: true });

for (const { from, to } of copies) {
  const src = path.join(root, "node_modules", from);
  if (!fs.existsSync(src)) {
    console.error(`sync-public-fonts: missing ${src} (run npm ci first)`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(dest, to));
}

const ofl = path.join(root, "node_modules", "@fontsource/geist-sans", "OFL.txt");
if (fs.existsSync(ofl)) {
  fs.copyFileSync(ofl, path.join(dest, "OFL.txt"));
}

console.log("sync-public-fonts: copied Geist woff2 files to frontend/public/fonts/");
