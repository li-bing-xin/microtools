#!/usr/bin/env node
/**
 * 预渲染产物校验：每个公开路由都必须真的落盘成 HTML，且 head 与 seo-kit 的期望一致。
 *
 * 校验项（每条路由）：
 *   - <title> 精确等于 seo-kit 算出的 title
 *   - <meta name="description"> 存在且一致
 *   - <link rel="canonical"> 指向规范 URL
 *   - robots 与 live 一致（live=false 必须 noindex）
 *   - JSON-LD 能解析，且包含该页声明的 @type（首页：WebApplication / FAQPage）
 *   - #root 里有真实正文（<h1> 非空）——证明不是空壳 SPA
 *   - 没有残留的 __SITE_*__ 占位符
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { displayPath, outputRoot } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const outRoot = outputRoot(manifest.site.basePath);

let passed = 0;
const failures = [];

function check(page, label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${page.path.padEnd(10)} ${label}`);
  } else {
    failures.push(`${page.path} ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${page.path.padEnd(10)} ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html, attribute, value) {
  const pattern = new RegExp(
    `<meta ${attribute}="${escapeRegExp(value)}" content="([^"]*)"`,
  );
  const match = pattern.exec(html);
  return match ? decodeEntities(match[1]) : undefined;
}

function collectTypes(node, types = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, types);
    return types;
  }
  if (node && typeof node === "object") {
    if (typeof node["@type"] === "string") types.push(node["@type"]);
    if (Array.isArray(node["@graph"])) collectTypes(node["@graph"], types);
  }
  return types;
}

console.log(`prerender verification — ${displayPath(outRoot)}\n`);

for (const page of manifest.pages) {
  const file = join(outRoot, page.outputPath);
  let html;
  try {
    html = await readFile(file, "utf8");
  } catch {
    failures.push(`${page.path} artifact missing — ${displayPath(file)}`);
    console.log(`  FAIL  ${page.path.padEnd(10)} artifact missing — ${displayPath(file)}`);
    continue;
  }

  const titleMatch = /<title>([^<]*)<\/title>/.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : undefined;
  check(page, "title", title === page.head.title, `want "${page.head.title}", got "${title ?? "(none)"}"`);

  const description = metaContent(html, "name", "description");
  const expectedDescription = page.head.meta.find((tag) => tag.name === "description")?.content;
  check(
    page,
    "description",
    description === expectedDescription,
    description ? "content differs" : "missing",
  );

  const canonicalMatch = /<link rel="canonical" href="([^"]*)"/.exec(html);
  const canonical = canonicalMatch ? decodeEntities(canonicalMatch[1]) : undefined;
  const expectedCanonical = page.head.links.find((link) => link.rel === "canonical")?.href;
  check(page, "canonical", canonical === expectedCanonical, `want "${expectedCanonical}", got "${canonical ?? "(none)"}"`);

  const robots = metaContent(html, "name", "robots");
  const expectedRobots = page.head.meta.find((tag) => tag.name === "robots")?.content;
  check(page, "robots", robots === expectedRobots, `want "${expectedRobots}", got "${robots ?? "(none)"}"`);

  const scripts = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const parsedTypes = [];
  let jsonLdOk = true;
  for (const script of scripts) {
    try {
      collectTypes(JSON.parse(script[1]), parsedTypes);
    } catch (error) {
      jsonLdOk = false;
      failures.push(`${page.path} JSON-LD parse error — ${error.message}`);
    }
  }
  const expectedTypes = page.head.jsonLd ? collectTypes(page.head.jsonLd) : [];
  const missingTypes = expectedTypes.filter((type) => !parsedTypes.includes(type));
  check(
    page,
    `json+ld (${expectedTypes.join(", ") || "none"})`,
    jsonLdOk && missingTypes.length === 0 && (scripts.length > 0) === Boolean(page.head.jsonLd),
    missingTypes.length ? `missing ${missingTypes.join(", ")}` : undefined,
  );

  const rootMatch = /<div id="root">([\s\S]*)<\/div>\s*<\/body>/.exec(html);
  const appHtml = rootMatch ? rootMatch[1] : "";
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(appHtml);
  const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";
  check(
    page,
    "static content",
    appHtml.length > 500 && h1Text.length > 0,
    appHtml.length > 500 ? "empty <h1>" : `#root too small (${appHtml.length} chars)`,
  );

  check(page, "no placeholders", !/__(APP_NAME|SITE_NAME|SITE_URL)__/.test(html));

  const assetTag = /<script[^>]+src="[^"]*assets\/[^"]+\.js"/.exec(html);
  check(page, "hashed js asset", Boolean(assetTag));
}

console.log(
  `\nprerender verification: ${passed} passed, ${failures.length} failed\n`,
);
if (failures.length > 0) process.exit(1);
