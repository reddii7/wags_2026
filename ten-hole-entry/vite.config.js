import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/entry/",
  plugins: [vue()],
  build: {
    outDir: "../dist/entry",
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    headers: { "Cache-Control": "no-store" },
  },
});
