import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    react(),
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
  ],
  base: "/app/",
  build: {
    outDir: "dist",
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
});
