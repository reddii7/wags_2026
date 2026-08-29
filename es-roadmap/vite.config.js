import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/es-roadmap/" : "/",
  plugins: [vue()],
  build: {
    outDir: "../dist/es-roadmap",
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5176,
    strictPort: true,
    headers: { "Cache-Control": "no-store" },
  },
});
