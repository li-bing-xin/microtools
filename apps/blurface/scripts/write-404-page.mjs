#!/usr/bin/env node
/**
 * 构建期产出 `dist/web/404.html`（模板没有这一步，blurface 必须有）。
 *
 * Cloudflare Workers Static Assets 的 `not_found_handling: "404-page"` 只会去找
 * 站点根下的 `404.html`：没有这个文件，未知路径会落到平台默认页，站内的样式、
 * 导航和"回首页"链接全丢；换成 SPA 回退又会让任意 URL 都返回 200（软 404 红线）。
 *
 * 内容渲染走 SSR bundle 的 renderNotFound()（root 的 notFoundComponent），
 * 文档壳与资源标签复用 vite build 产出的 index.html，保证与预渲染页同一套 CSS/JS。
 * 404 页额外带 noindex：它永远不该进索引。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { distDir, displayPath } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const ASSET_TAG =
  /<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>|<link\b[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*\/?>/g;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const site = manifest.site;

const builtHtml = await readFile(join(distDir, "index.html"), "utf8");
const assetTags = [...builtHtml.matchAll(ASSET_TAG)].map((match) => match[0]);
if (assetTags.length === 0) {
  throw new Error("dist/web/index.html 里没有带 hash 的资源标签，vite build 是否真的跑过？");
}

const title = `Page not found | ${site.name}`;
const description = "That URL does not exist on this site.";
const appHtml = await bundle.renderNotFound();

const document = `<!doctype html>
<html lang="${site.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="noindex, follow" />
${assetTags.map((tag) => `    ${tag}`).join("\n")}
  </head>
  <body>
    <div id="root">${appHtml}</div>
  </body>
</html>
`;

const file = join(distDir, "404.html");
await writeFile(file, document, "utf8");
console.log(`  wrote ${displayPath(file)} (noindex, served by not_found_handling=404-page)`);
