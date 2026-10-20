#!/usr/bin/env node
/**
 * sitemap 覆盖率双向校验：
 *   1. sitemap 里的每个 <loc> 都必须有对应产物 HTML（加了不存在的 URL -> 红）；
 *   2. 每个可索引产物（没有 noindex 的 index.html）都必须在 sitemap 里；
 *   3. noindex 产物不得出现在 sitemap（live=false 的空壳页不进 sitemap）。
 *
 * 删掉一条产物、或在 sitemap 里手写一条不存在的 URL，都必须让本脚本非零退出。
 */
import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { displayPath, outputPathFor, outputRoot } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const outRoot = outputRoot(manifest.site.basePath);
const baseUrl = manifest.site.url.replace(/\/+$/, "");

let passed = 0;
const failures = [];

function pass(message) {
  passed += 1;
  console.log(`  PASS  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.log(`  FAIL  ${message}`);
}

function decodeEntities(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function urlForPath(path) {
  return `${baseUrl}${path}`;
}

function pathForUrl(url) {
  if (url === baseUrl || url === `${baseUrl}/`) return "/";
  if (!url.startsWith(`${baseUrl}/`)) return null;
  return url.slice(baseUrl.length);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listArtifacts(dir) {
  const artifacts = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...(await listArtifacts(path)));
    } else if (entry.name === "index.html") {
      artifacts.push(path);
    }
  }
  return artifacts;
}

function routePathForArtifact(file) {
  const rel = relative(outRoot, file).split("\\").join("/");
  if (rel === "index.html") return "/";
  return `/${rel.replace(/\/index\.html$/, "")}`;
}

const sitemapFile = join(outRoot, "sitemap.xml");
if (!(await exists(sitemapFile))) {
  console.error(`missing ${displayPath(sitemapFile)} — run the build first`);
  process.exit(1);
}

const sitemapXml = await readFile(sitemapFile, "utf8");
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
  decodeEntities(match[1].trim()),
);
const sitemapSet = new Set(sitemapUrls);

const expectedPages = manifest.pages.filter((page) => page.live);
const expectedUrls = expectedPages.map((page) => urlForPath(page.path));
const expectedSet = new Set(expectedUrls);

console.log(`sitemap coverage — ${displayPath(sitemapFile)} (${sitemapUrls.length} url)\n`);

// 0. 每条声明的页面（含 noindex）都必须有产物：删掉任何一条产物都要红。
for (const page of manifest.pages) {
  const file = join(outRoot, page.outputPath);
  if (await exists(file)) pass(`declared page has artifact: ${page.path}`);
  else fail(`declared page has no artifact: ${page.path} -> ${displayPath(file)}`);
}

// 1. 每条 live 路由都必须进 sitemap，且产物存在。
for (const page of expectedPages) {
  const url = urlForPath(page.path);
  if (!sitemapSet.has(url)) fail(`live page missing from sitemap: ${url}`);
  else pass(`live page in sitemap: ${page.path}`);
}

// 2. sitemap 里的每条 URL 都必须有产物，且确实是一个声明过的 live 页面。
for (const url of sitemapUrls) {
  const path = pathForUrl(url);
  if (path === null) {
    fail(`sitemap url outside site url ${baseUrl}: ${url}`);
    continue;
  }
  const file = join(outRoot, outputPathFor(path));
  if (!(await exists(file))) {
    fail(`sitemap url has no prerendered artifact: ${url} -> ${displayPath(file)}`);
    continue;
  }
  if (!expectedSet.has(url)) {
    fail(`sitemap url is not a declared live page: ${url}`);
    continue;
  }
  pass(`sitemap url resolves to artifact: ${path}`);
}

// 3. 反向扫描产物：可索引的必须在 sitemap，noindex 的必须不在。
const artifacts = await listArtifacts(outRoot);
for (const file of artifacts) {
  const path = routePathForArtifact(file);
  const html = await readFile(file, "utf8");
  const noindex = /<meta name="robots" content="noindex/i.test(html);
  const url = urlForPath(path);

  if (noindex && sitemapSet.has(url)) {
    fail(`noindex artifact leaked into sitemap: ${path}`);
  } else if (!noindex && !sitemapSet.has(url)) {
    fail(`indexable artifact missing from sitemap: ${path}`);
  } else {
    pass(`${noindex ? "noindex" : "indexable"} artifact handled correctly: ${path}`);
  }
}

console.log(
  `\nsitemap coverage: ${sitemapUrls.length} url, ${artifacts.length} artifact(s), ${expectedPages.length} live page(s)`,
);
console.log(`sitemap coverage verification: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
