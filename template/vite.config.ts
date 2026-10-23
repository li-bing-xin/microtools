import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { postbuildPlugin } from "./scripts/vite-plugin-postbuild.mjs";
import { site } from "./src/lib/site.ts";

/**
 * 静态站构建：按渲染模式把产物补成最终形态（预渲染 HTML + sitemap + 校验）。
 *
 * cloudflare() 让 `cf deploy` 能把同一份 Vite 构建读成 Build Output
 * （Worker 入口 + 静态资源）；postbuildPlugin() 在构建链里写 deploy-marker 并跑
 * scripts/postbuild.mjs（按模式：预渲染链 / SPA 重定位 + 校验），因此
 * `npm run build` 与 `cf deploy` 走的是同一条链。
 *
 * base 由 site.url 的 pathname 推导：根域部署是 "/"，子路径部署（如 /tools）是 "/tools/"。
 */
export default defineConfig({
  base: site.basePath,
  plugins: [react(), cloudflare(), postbuildPlugin()],
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
