import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Vite production build guard", () => {
  it("refuses a production-mode build when NODE_ENV is development", () => {
    expect(() => {
      execSync("npx vite build --config frontend/vite.config.ts --mode production", {
        cwd: root,
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_ENV: "development",
          QUORUM_FRONTEND_OUT_DIR: "dist-guard-test",
        },
      });
    }).toThrow();
  });
});
