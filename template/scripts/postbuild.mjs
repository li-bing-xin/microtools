#!/usr/bin/env node
/**
 * 构建后处理：按渲染模式跑构建链的剩余步骤。
 *
 * 被 scripts/vite-plugin-postbuild.mjs 在 Vite 客户端产物落盘后调用，
 * 由 SITE_DIST_DIR 指定产物目录（默认 dist/web，`cf deploy` 时是 Build Output 的 assets）。
 * 步骤与旧 npm 串链一致（write-deploy-marker 已上移进 vite 插件的 buildStart）：
 * - prerender：预渲染 → 静态 SEO 文件 → 三项校验；
 * - spa：子路径重定位 → 模式校验。
 */
import { spawnSync } from "node:child_process";
import { loadSiteConfig } from "./lib/site-config.mjs";
import { appRoot } from "./lib/paths.mjs";

const { renderMode } = await loadSiteConfig();
const STEPS =
  renderMode === "prerender"
    ? [
        "scripts/prerender-marketing.mjs",
        "scripts/write-static-seo-files.mjs",
        "scripts/verify-prerender-output.mjs",
        "scripts/verify-sitemap-coverage.mjs",
        "scripts/verify-render-mode.mjs",
      ]
    : ["scripts/relocate-base-path.mjs", "scripts/verify-render-mode.mjs"];

for (const step of STEPS) {
  const result = spawnSync(process.execPath, [step], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`\npostbuild failed at ${step} (exit ${result.status ?? "signal"})`);
    process.exit(result.status ?? 1);
  }
}
