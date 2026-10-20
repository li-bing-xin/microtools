import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { site } from "./src/lib/site.ts";

/**
 * 静态站构建：产物落 dist/web，再由 scripts/prerender-marketing.mjs
 * 把每个公开路由渲染成真正的 HTML 文件。
 *
 * base 由 site.url 的 pathname 推导：根域部署是 "/"，子路径部署（如 /tools）是 "/tools/"。
 */
export default defineConfig({
  base: site.basePath,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    sourcemap: false,
  },
});
