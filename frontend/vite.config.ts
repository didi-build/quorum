import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { assertNoMockArtifactsInProductionDist } from "../scripts/lib/frontend-dist-mock-scan.mjs";

const frontendRoot = import.meta.dirname;

function resolveOutDir(mode: string): string {
  const override =
    mode === "mock-preview"
      ? process.env.QUORUM_FRONTEND_PREVIEW_OUT_DIR
      : process.env.QUORUM_FRONTEND_OUT_DIR;
  if (override) {
    return path.isAbsolute(override) ? override : path.join(frontendRoot, override);
  }
  return path.join(frontendRoot, mode === "mock-preview" ? "dist-preview" : "dist");
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

export default defineConfig(({ mode, command }) => {
  if (command === "build") {
    assertAllowedProductionBuild(mode);
  }

  const enablePwa = mode !== "mock-preview";
  const outDir = resolveOutDir(mode);

  return {
    root: frontendRoot,
    plugins: [
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
      {
        name: "quorum-production-mock-guard",
        enforce: "post",
        closeBundle() {
          if (command !== "build" || mode !== "production") {
            return;
          }
          assertNoMockArtifactsInProductionDist(outDir);
        },
      },
    ],
    base: "/app/",
    build: {
      outDir,
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
