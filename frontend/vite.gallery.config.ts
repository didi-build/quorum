import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const frontendRoot = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  base: "/gallery/",
  root: path.join(frontendRoot, "gallery"),
  resolve: {
    alias: {
      "@": path.join(frontendRoot, "src"),
    },
  },
  build: {
    outDir: path.join(frontendRoot, "dist-preview/gallery"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
