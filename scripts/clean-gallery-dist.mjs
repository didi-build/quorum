#!/usr/bin/env node
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  getGalleryAssetsRoot,
  getGalleryUrlPrefix,
} from "./lib/gallery-assets-root.mjs";

const assetsRoot = getGalleryAssetsRoot();
const galleryDirName = getGalleryUrlPrefix().replace(/^\//, "");

rmSync(join(assetsRoot, galleryDirName), { recursive: true, force: true });
