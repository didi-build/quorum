import react from "@vitejs/plugin-react";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { assertNoMockArtifactsInProductionDist } from "../scripts/lib/frontend-dist-mock-scan.mjs";
import { assertMockPreviewOutDirNotProductionDist } from "../scripts/lib/frontend-outdir-guard.mjs";
import { quorumAuthMockGuard } from "./vite-auth-mock-guard";

const frontendRoot = import.meta.dirname;

function resolveDefaultOutDir(mode: string): string {
  const override =
    mode === "mock-preview"
      ? process.env.QUORUM_FRONTEND_PREVIEW_OUT_DIR
      : process.env.QUORUM_FRONTEND_OUT_DIR;
  if (override) {
    return path.isAbsolute(override) ? override : path.join(frontendRoot, override);
  }
  return path.join(frontendRoot, mode === "mock-preview" ? "dist-preview" : "dist");
}

function normalizeOutDir(configured: string | undefined, mode: string): string {
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(frontendRoot, configured);
  }
  return resolveDefaultOutDir(mode);
}

function assertAllowedProductionBuild(mode: string): void {
  if (mode !== "production" && mode !== "mock-preview") {
    throw new Error(
      `Refusing Vite build: mode must be "production" or "mock-preview" (got "${mode}").`,
    );
  }
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `Refusing Vite build: NODE_ENV must be "production" (got "${process.env.NODE_ENV ?? ""}").`,
    );
  }
}

function quorumBuildOutDirGuardPlugin(mode: string, command: string): Plugin {
  return {
    name: "quorum-build-outdir-guard",
    config(config, { command: cmd }) {
      if (cmd !== "build") {
        return {};
      }
      const outDir = normalizeOutDir(config.build?.outDir, mode);
      return { build: { outDir } };
    },
    configResolved(config) {
      if (command === "build" && mode === "mock-preview") {
        const resolvedOutDir = path.resolve(config.build.outDir);
        assertMockPreviewOutDirNotProductionDist(resolvedOutDir, frontendRoot);
      }
    },
  };
}

function quorumProductionMockGuardPlugin(mode: string, command: string): Plugin {
  let resolvedBuildOutDir: string | null = null;

  return {
    name: "quorum-production-mock-guard",
    enforce: "post",
    configResolved(config) {
      resolvedBuildOutDir = path.resolve(config.build.outDir);
    },
    closeBundle() {
      if (command !== "build" || mode !== "production" || !resolvedBuildOutDir) {
        return;
      }
      assertNoMockArtifactsInProductionDist(resolvedBuildOutDir);
    },
  };
}

export default defineConfig(({ mode, command }) => {
  if (command === "build") {
    assertAllowedProductionBuild(mode);
  }

  const enablePwa = mode !== "mock-preview";

  return {
    root: frontendRoot,
    plugins: [
      quorumAuthMockGuard(),
      quorumBuildOutDirGuardPlugin(mode, command),
      react(),
      ...(enablePwa
        ? [
            VitePWA({
              registerType: "autoUpdate",
              includeAssets: ["icon.svg"],
              manifest: {
                name: "Quorum",
                short_name: "Quorum",
                description:
                  "Group decisions by AI seats that reach a consensus recommendation.",
                theme_color: "#141210",
                background_color: "#141210",
                display: "standalone",
                start_url: "/app/",
                scope: "/app/",
                icons: [
                  {
                    src: "icon.svg",
                    sizes: "any",
                    type: "image/svg+xml",
                    purpose: "any maskable",
                  },
                  {
                    src: "pwa-192.png",
                    sizes: "192x192",
                    type: "image/png",
                  },
                ],
              },
              workbox: {
                navigateFallback: "/app/index.html",
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
              },
            }),
          ]
        : []),
      quorumProductionMockGuardPlugin(mode, command),
    ],
    base: "/app/",
    build: {
      emptyOutDir: true,
    },
    publicDir: "public",
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      env: {
        BASE_URL: "/app/",
      },
    },
  };
});
