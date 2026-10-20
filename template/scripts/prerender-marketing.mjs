#!/usr/bin/env node
/**
 * 构建期预渲染：把每个公开路由渲染成真正的 HTML 文件（关掉 JS 也能读到内容）。
 *
 * 流程：
 *   vite build                      -> dist/web/index.html（带 hash 的 JS/CSS）
 *   src/ssr.tsx (esbuild)           -> Node 可执行 CJS SSR bundle
 *   renderPage(path)                -> #root 里的 HTML
 *   renderHeadHtml(page.head)       -> title / description / canonical / JSON-LD
 *   本脚本                          -> 拼文档壳、写 dist/web/<path>/index.html
 *
 * 不做运行时 SSR：产物就是静态文件，Workers Static Assets 直接托管。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { relocateForBasePath } from "./lib/base-path.mjs";
import { distDir, displayPath, outputRoot } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23111827'/%3E%3Cpath d='M9 21 16 9l7 12z' fill='%236ee7b7'/%3E%3C/svg%3E";

// Vite 注入的入口 script（含 hash）与抽取出来的 CSS / modulepreload。
const ASSET_TAG =
  /<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>|<link\b[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*\/?>/g;

function extractAssetTags(html) {
  return [...html.matchAll(ASSET_TAG)].map((match) => match[0]);
}

function composeDocument({ lang, headHtml, assetTags, appHtml }) {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="${FAVICON}" />
${headHtml}
${assetTags.map((tag) => `    ${tag}`).join("\n")}
  </head>
  <body>
    <div id="root">${appHtml}</div>
  </body>
</html>
`;
}

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const outRoot = outputRoot(manifest.site.basePath);

const builtHtml = await readFile(join(distDir, "index.html"), "utf8");
const assetTags = extractAssetTags(builtHtml);
if (assetTags.length === 0) {
  throw new Error(
    "dist/web/index.html 里没有找到带 hash 的 JS/CSS 资源标签，vite build 是否真的跑过？",
  );
}

for (const page of manifest.pages) {
  const appHtml = await bundle.renderPage(page.path);
  const document = composeDocument({
    lang: manifest.site.lang,
    headHtml: bundle.renderHeadHtml(page.head),
    assetTags,
    appHtml,
  });

  const file = join(outRoot, page.outputPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, document, "utf8");
  console.log(`  prerendered ${page.path} -> ${displayPath(file)}`);
}

const moved = await relocateForBasePath({
  basePath: manifest.site.basePath,
  outRoot,
  keepIndexHtml: false,
});
if (moved) {
  console.log(`  relocated bundled assets into ${displayPath(outRoot)} (base ${manifest.site.basePath})`);
}
console.log(
  `\n  ${manifest.pages.length} route(s) prerendered into ${displayPath(outRoot)} (base ${manifest.site.basePath})`,
);
