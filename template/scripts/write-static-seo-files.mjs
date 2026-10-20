#!/usr/bin/env node
/**
 * 构建期落盘 sitemap.xml / robots.txt（仅 prerender 模式）。
 *
 * 内容由 src/ssr.tsx 的 getSeoFiles() 提供 —— 脚本是 .mjs，不直接 import TS 切片，
 * 这样「哪些页面 live / 进 sitemap」始终只有 src/lib/pages.ts 一份实现。
 * noindex 页面即便有产物也不进 sitemap（与 lib/head.ts 的 robots 共用同一个 live 标志）。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { displayPath, outputRoot } from "./lib/paths.mjs";
import { loadSsrBundle } from "./lib/ssr-bundle.mjs";

const bundle = await loadSsrBundle();
const manifest = bundle.getPrerenderManifest();
const outRoot = outputRoot(manifest.site.basePath);
const { sitemap, robots } = bundle.getSeoFiles();
const urlCount = (sitemap.match(/<loc>/g) ?? []).length;

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, "sitemap.xml"), sitemap, "utf8");
await writeFile(join(outRoot, "robots.txt"), robots, "utf8");

console.log(
  `  wrote ${displayPath(join(outRoot, "sitemap.xml"))} (${urlCount} url) and robots.txt`,
);
