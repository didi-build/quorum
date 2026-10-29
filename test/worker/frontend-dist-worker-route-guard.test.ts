import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { assertNoReservedWorkerPathShadowsInFrontendDist } from "../../scripts/lib/frontend-dist-worker-route-guard.mjs";

const productionDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../frontend/dist",
);

describe("frontend dist worker route guard (worker integration)", () => {
  it("frontend/dist has no files under /api, /council, or /chat", () => {
    assertNoReservedWorkerPathShadowsInFrontendDist(productionDist);
  });
});
