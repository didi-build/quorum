import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MOCK_PREVIEW_HEADERS,
  MOCK_PREVIEW_REDIRECTS,
} from "../scripts/lib/mock-preview-static.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(root, "node_modules/wrangler/bin/wrangler.js");

function runMockPreviewBuild(distDir: string): void {
  execSync("node scripts/sync-public-fonts.mjs", { cwd: root, stdio: "pipe" });
  execSync("npx vite build --config frontend/vite.config.ts --mode mock-preview", {
    cwd: root,
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      QUORUM_FRONTEND_PREVIEW_OUT_DIR: distDir,
    },
  });
  execSync("node scripts/finish-frontend-dist.mjs", {
    cwd: root,
    stdio: "pipe",
    env: {
      ...process.env,
      FRONTEND_DIST: distDir,
      QUORUM_FRONTEND_DIST_PROFILE: "mock-preview",
    },
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (response.status > 0) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`server did not become ready at ${url}`);
}

function spawnWranglerDev(previewDist: string, port: number): ChildProcess {
  return spawn(
    process.execPath,
    [
      wranglerBin,
      "dev",
      "--config",
      "wrangler.preview.jsonc",
      "--assets",
      previewDist,
      "--port",
      String(port),
    ],
    {
      cwd: root,
      stdio: "pipe",
      env: process.env,
      detached: process.platform !== "win32",
    },
  );
}

async function stopWranglerDev(child: ChildProcess): Promise<void> {
  if (!child.pid) {
    return;
  }
  const signal = process.platform === "win32" ? "SIGTERM" : undefined;
  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      try {
        if (process.platform !== "win32") {
          process.kill(-child.pid!, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // already exited
      }
      resolve();
    }, 10_000);
    child.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });
    try {
      if (process.platform !== "win32") {
        process.kill(-child.pid!, "SIGTERM");
      } else {
        child.kill(signal ?? "SIGTERM");
      }
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
  });
}

describe("mock-preview dist-preview static layout", () => {
  it(
    "omits root landing, emits _redirects and _headers, and serves them via wrangler dev",
    { timeout: 120_000 },
    async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-preview-static-"));
      const previewDist = path.join(tmp, "dist-preview");
      fs.mkdirSync(previewDist, { recursive: true });

      runMockPreviewBuild(previewDist);

      expect(fs.existsSync(path.join(previewDist, "index.html"))).toBe(false);
      expect(fs.existsSync(path.join(previewDist, "style.css"))).toBe(false);
      expect(fs.readFileSync(path.join(previewDist, "_redirects"), "utf8")).toBe(
        MOCK_PREVIEW_REDIRECTS,
      );
      expect(fs.readFileSync(path.join(previewDist, "_headers"), "utf8")).toBe(
        MOCK_PREVIEW_HEADERS,
      );
      expect(fs.existsSync(path.join(previewDist, "app", "index.html"))).toBe(true);

      const port = 19_000 + Math.floor(Math.random() * 1000);
      const wrangler = spawnWranglerDev(previewDist, port);

      try {
        await waitForServer(`http://127.0.0.1:${port}/`);

        const rootResponse = await fetch(`http://127.0.0.1:${port}/`, {
          redirect: "manual",
        });
        expect(rootResponse.status).toBe(302);
        expect(rootResponse.headers.get("Location")).toMatch(/\/app\/$/);
        expect(rootResponse.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

        const appResponse = await fetch(`http://127.0.0.1:${port}/app/`, {
          redirect: "manual",
        });
        expect(appResponse.status).toBe(200);
        expect(appResponse.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      } finally {
        await stopWranglerDev(wrangler);
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(path.join(root, ".wrangler"), { recursive: true, force: true });
      }
    },
  );
});
