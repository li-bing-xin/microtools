#!/usr/bin/env node
/**
 * SPA 模式的子路径部署处理：vite build 之后把 index.html + assets 搬进
 * dist/web/<base>/，并改写 _headers。base 为 "/" 时是 no-op。
 */
import { displayPath, outputRoot } from "./lib/paths.mjs";
import { relocateForBasePath } from "./lib/base-path.mjs";
import { loadSiteConfig } from "./lib/site-config.mjs";

const { site } = await loadSiteConfig();
const outRoot = outputRoot(site.basePath);
const moved = await relocateForBasePath({
  basePath: site.basePath,
  outRoot,
  keepIndexHtml: true,
});

if (moved) {
  console.log(`  relocated SPA build into ${displayPath(outRoot)} (base ${site.basePath})`);
} else {
  console.log('  base path is "/", no relocation needed');
}
