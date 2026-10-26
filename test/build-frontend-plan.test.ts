import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveBuildFrontendPlan } from "../scripts/lib/build-frontend-plan.mjs";

/** POSIX inline env (fails on Windows cmd/PowerShell); not valid in npm script strings. */
const POSIX_INLINE_ENV = /(?:^|[\s&;])([a-z][a-z0-9_]*)=/i;

describe("build-frontend plan", () => {
  it("maps mock-preview to frontend/dist-preview for finish-frontend-dist", () => {
    expect(resolveBuildFrontendPlan("mock-preview").frontendDist).toBe(
      "frontend/dist-preview",
    );
    expect(resolveBuildFrontendPlan("production").frontendDist).toBe("frontend/dist");
  });

  it("rejects unknown modes", () => {
    expect(() => resolveBuildFrontendPlan("staging")).toThrow(
      /Unknown frontend build mode/,
    );
  });
});

describe("package.json scripts (cross-platform env)", () => {
  it("flags lowercase inline env assignments (case-insensitive probe)", () => {
    expect("vite build && frontend_dist=frontend/dist-preview node finish.mjs").toMatch(
      POSIX_INLINE_ENV,
    );
  });

  it("do not use POSIX inline VAR=value env assignments", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const [name, script] of Object.entries(pkg.scripts)) {
      expect(script, `script ${name}`).not.toMatch(POSIX_INLINE_ENV);
    }
  });
});
