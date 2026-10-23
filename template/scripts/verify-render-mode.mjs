#!/usr/bin/env node
/**
 * 渲染模式一致性校验（构建链最后一步，两种模式都跑）。
 *
 * 这是 BING-38 修订版里「软 404 红线」的自动拦截点：
 * - spa 模式：cloudflare.config.ts 必须是 single-page-application；产物只能有 index.html，不能有 sitemap/预渲染页；
 * - prerender 模式：cloudflare.config.ts 必须是 404-page；sitemap 必须存在；产物里的每个 index.html
 *   都必须在 pages.ts 的显式清单里（不能悄悄全站预渲染）。
 *
 * 把 single-page-application 配到 prerender 站点上 → 本脚本非零退出。
 */
import { access, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { loadSiteConfig } from "./lib/site-config.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";
import { appRoot, displayPath, outputPathFor, outputRoot } from "./lib/paths.mjs";

let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listIndexHtml(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listIndexHtml(path)));
    } else if (entry.name === "index.html") {
      files.push(path);
    }
  }
  return files;
}

const { site, renderMode } = await loadSiteConfig();
const outRoot = outputRoot(site.basePath);
const cloudflareConfig = await readFile(join(appRoot, "cloudflare.config.ts"), "utf8");
const handling = /notFoundHandling\s*:\s*"([^"]+)"/.exec(cloudflareConfig)?.[1];

console.log(`render mode verification — ${renderMode} (base ${site.basePath})\n`);

check(
  "renderMode is valid",
  renderMode === "spa" || renderMode === "prerender",
  `got "${renderMode}"`,
);
check("cloudflare.config.ts has notFoundHandling", Boolean(handling));

if (renderMode === "spa") {
  check(
    "SPA mode uses single-page-application",
    handling === "single-page-application",
    `got "${handling ?? "(none)"}"`,
  );
  check("dist/web/index.html exists", await exists(join(outRoot, "index.html")));
  check("no sitemap.xml in SPA mode", !(await exists(join(outRoot, "sitemap.xml"))));
  check("no robots.txt in SPA mode", !(await exists(join(outRoot, "robots.txt"))));
  check("assets/ exists", await exists(join(outRoot, "assets")));
  check("deploy-marker.txt exists", await exists(join(outRoot, "deploy-marker.txt")));

  const pages = await listIndexHtml(outRoot);
  check(
    "only the SPA shell index.html is emitted",
    pages.length === 1,
    pages.map((page) => displayPath(page)).join(", "),
  );
} else if (renderMode === "prerender") {
  check(
    "prerender mode uses 404-page (no SPA fallback / soft 404)",
    handling === "404-page",
    `got "${handling ?? "(none)"}" — single-page-application would make every unknown URL return 200`,
  );
  check("sitemap.xml exists", await exists(join(outRoot, "sitemap.xml")));
  check("deploy-marker.txt exists", await exists(join(outRoot, "deploy-marker.txt")));

  const manifest = (await loadSsrBundle()).getPrerenderManifest();
  for (const page of manifest.pages) {
    const file = join(outRoot, outputPathFor(page.path));
    check(`prerendered artifact exists: ${page.path}`, await exists(file), displayPath(file));
  }

  const emitted = await listIndexHtml(outRoot);
  const expected = new Set(manifest.pages.map((page) => page.outputPath.split("\\").join("/")));
  const extras = emitted
    .map((file) => relative(outRoot, file).split("\\").join("/"))
    .filter((relativePath) => !expected.has(relativePath));
  check(
    "no artifacts outside the explicit pages.ts list",
    extras.length === 0,
    extras.join(", "),
  );
}

console.log(`\nrender mode verification: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
