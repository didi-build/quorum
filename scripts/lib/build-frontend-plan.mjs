/** @typedef {"production" | "mock-preview"} BuildFrontendMode */

/**
 * @type {Record<BuildFrontendMode, { viteMode: string; frontendDist: string }>}
 */
export const BUILD_FRONTEND_PLANS = {
  production: {
    viteMode: "production",
    frontendDist: "frontend/dist",
  },
  "mock-preview": {
    viteMode: "mock-preview",
    frontendDist: "frontend/dist-preview",
  },
};

/**
 * @param {string | undefined} mode
 */
export function resolveBuildFrontendPlan(mode) {
  const plan = BUILD_FRONTEND_PLANS[mode];
  if (!plan) {
    throw new Error(
      `Unknown frontend build mode "${mode ?? ""}" (expected production or mock-preview)`,
    );
  }
  return plan;
}
