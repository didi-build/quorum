import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("vite auth mock guard (subprocess)", () => {
  it("fails production build when VITE_AUTH_MOCK is set", () => {
    const result = spawnSync(
      "npx",
      ["vite", "build", "--config", "frontend/vite.config.ts"],
      {
        cwd: root,
        env: {
          ...process.env,
          VITE_AUTH_MOCK: "true",
          NODE_ENV: "production",
        },
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr ?? result.stdout).toContain("VITE_AUTH_MOCK");
  });
});
