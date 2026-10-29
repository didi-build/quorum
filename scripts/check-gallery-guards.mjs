#!/usr/bin/env node
import { runGalleryGuards } from "./lib/check-gallery-guards-lib.mjs";

const errors = runGalleryGuards();
if (errors.length > 0) {
  console.error("gallery-guards: failed\n");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("gallery-guards: OK");
