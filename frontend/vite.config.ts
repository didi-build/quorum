import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Quorum",
        short_name: "Quorum",
        description:
          "Group decisions by AI seats that reach a consensus recommendation.",
        theme_color: "#1a1a1a",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  base: "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  publicDir: "public",
});
