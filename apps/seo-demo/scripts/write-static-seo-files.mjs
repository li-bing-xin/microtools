#!/usr/bin/env node
/**
 * 构建期生成 sitemap.xml / robots.txt。
 *
 * 只收录 live: true 的页面；noindex 页面即便有产物也不进 sitemap
 * （与 lib/head.ts 的 robots 共用 seo-kit 的同一个 live 标志）。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildRobots,
  buildSitemap,
  renderRobotsTxt,
  renderSitemapXml,
} from "@microtools/seo-kit";
import { displayPath, outputRoot } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const outRoot = outputRoot(manifest.site.basePath);
const siteConfig = { url: manifest.site.url, name: manifest.site.name };

const entries = buildSitemap(siteConfig, {
  staticPages: manifest.pages
    .filter((page) => page.live)
    .map((page) => ({
      path: page.path,
      priority: page.sitemap.priority,
      changeFrequency: page.sitemap.changeFrequency,
    })),
  lastModified: new Date(),
});

const robots = buildRobots(siteConfig);

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, "sitemap.xml"), renderSitemapXml(entries), "utf8");
await writeFile(join(outRoot, "robots.txt"), renderRobotsTxt(robots), "utf8");

console.log(
  `  wrote ${displayPath(join(outRoot, "sitemap.xml"))} (${entries.length} url) and robots.txt`,
);
