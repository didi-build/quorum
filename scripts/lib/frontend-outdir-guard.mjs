import path from "node:path";

/**
 * @param {string} frontendRoot absolute path to frontend/
 * @returns {string}
 */
export function productionFrontendDistDir(frontendRoot) {
  return path.resolve(frontendRoot, "dist");
}

/**
 * True when `target` is the same path as `parent` or a subdirectory of `parent`.
 *
 * @param {string} target
 * @param {string} parent
 */
export function isPathInsideOrEqual(target, parent) {
  const resolvedTarget = path.resolve(target);
  const resolvedParent = path.resolve(parent);
  if (resolvedTarget === resolvedParent) {
    return true;
  }
  const relative = path.relative(resolvedParent, resolvedTarget);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * @param {string} outDir resolved or resolvable outDir for a mock-preview build
 * @param {string} frontendRoot absolute path to frontend/
 */
export function assertMockPreviewOutDirNotProductionDist(outDir, frontendRoot) {
  const productionDist = productionFrontendDistDir(frontendRoot);
  const resolvedOutDir = path.resolve(outDir);
  if (isPathInsideOrEqual(resolvedOutDir, productionDist)) {
    throw new Error(
      `Refusing mock-preview build: outDir must not be ${productionDist} or inside it (got ${resolvedOutDir}).`,
    );
  }
}
