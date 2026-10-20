#!/usr/bin/env node
/**
 * 共享切片契约冒烟：`npm test` 会先 `scripts/build-shared.mjs` 打出 ESM，再跑这里。
 *
 * 只断言「必须永远成立」的契约，不测 UI：
 * - noindex 与 sitemap 由同一个 live 标志驱动；
 * - canonical / title 不重复品牌后缀；
 * - FAQPage / WebApplication 结构完整，@graph 只有一个 @context；
 * - 大图降采样阈值不被改动；
 * - 切片本身零第三方依赖（只允许站点注入的 @mediapipe/tasks-vision）。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadSlice = (name) => import(pathToFileURL(path.join(root, ".cache", "shared", `${name}.mjs`)).href);

const {
  absoluteUrl,
  buildPageMetadata,
  buildRobots,
  buildSitemap,
  faqPageJsonLd,
  jsonLdGraph,
  renderRobotsTxt,
  renderSitemapXml,
  webApplicationJsonLd,
} = await loadSlice("seo");
const { MAX_EDGE, clampScale } = await loadSlice("render");

const site = { url: "https://example.com", name: "Example" };
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

check("canonical joins url and path exactly once", () => {
  const meta = buildPageMetadata(site, {
    path: "/blur-face-in-photo",
    title: "Blur Faces",
    description: "d",
    live: true,
  });
  assert.equal(meta.alternates.canonical, "https://example.com/blur-face-in-photo");
  assert.equal(meta.title.absolute, "Blur Faces | Example");
  assert.equal(meta.robots, undefined);
  assert.equal(meta.openGraph.url, "https://example.com/blur-face-in-photo");
  assert.equal(
    meta.openGraph.images[0].url,
    "https://example.com/blur-face-in-photo/opengraph-image",
  );
});

check("non-live page is noindex but still crawlable", () => {
  const meta = buildPageMetadata(site, {
    path: "/pixelate-image",
    title: "Pixelate",
    description: "d",
    live: false,
  });
  assert.deepEqual(meta.robots, { index: false, follow: true });
});

check("image: null suppresses OG image and twitter card", () => {
  const meta = buildPageMetadata(site, {
    path: "/privacy",
    title: "Privacy",
    description: "d",
    live: true,
    image: null,
  });
  assert.equal(meta.openGraph.images, undefined);
  assert.equal(meta.twitter, undefined);
});

check("sitemap includes only live pages, static pages always", () => {
  const entries = buildSitemap(site, {
    staticPages: [{ path: "/privacy", priority: 0.3 }],
    pages: [
      { path: "/live-tool", live: true },
      { path: "/draft-tool", live: false },
    ],
    lastModified: new Date("2026-10-19T00:00:00Z"),
  });
  const urls = entries.map((e) => e.url);
  assert.deepEqual(urls, ["https://example.com/privacy", "https://example.com/live-tool"]);
  const xml = renderSitemapXml(entries);
  assert.match(xml, /<loc>https:\/\/example\.com\/live-tool<\/loc>/);
  assert.doesNotMatch(xml, /draft-tool/);
  assert.match(xml, /<lastmod>2026-10-19<\/lastmod>/);
});

check("robots points at the canonical sitemap", () => {
  const robots = buildRobots(site);
  assert.equal(robots.sitemap, "https://example.com/sitemap.xml");
  assert.equal(robots.rules.userAgent, "*");
});

check("robots.txt serialization keeps the sitemap directive", () => {
  const txt = renderRobotsTxt(buildRobots(site, { disallow: ["/draft"] }));
  assert.match(txt, /^User-agent: \*$/m);
  assert.match(txt, /^Allow: \/$/m);
  assert.match(txt, /^Disallow: \/draft$/m);
  assert.match(txt, /^Sitemap: https:\/\/example\.com\/sitemap\.xml$/m);
});

check("FAQPage mirrors the visible FAQ array", () => {
  const items = [
    { question: "Q1", answer: "A1" },
    { question: "Q2", answer: "A2" },
  ];
  const ld = faqPageJsonLd(items);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, 2);
  assert.equal(ld.mainEntity[1].acceptedAnswer.text, "A2");
});

check("WebApplication is free and browser-based", () => {
  const ld = webApplicationJsonLd({
    name: "Blur Faces",
    description: "d",
    url: "https://example.com/blur-face-in-photo",
  });
  assert.equal(ld["@type"], "WebApplication");
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.offers.price, "0");
});

check("@graph keeps a single @context", () => {
  const graph = jsonLdGraph([faqPageJsonLd([]), webApplicationJsonLd({ name: "n", description: "d", url: "u" })]);
  assert.equal(graph["@context"], "https://schema.org");
  assert.equal(graph["@graph"].length, 2);
  assert.ok(graph["@graph"].every((node) => node["@context"] === undefined));
  assert.equal(JSON.stringify(graph).match(/"@context"/g).length, 1);
});

check("absoluteUrl accepts absolute input unchanged", () => {
  assert.equal(absoluteUrl(site, "https://other.test/x"), "https://other.test/x");
});

check("large images are downsampled to MAX_EDGE", () => {
  assert.equal(clampScale(1000, 800), 1);
  assert.equal(clampScale(8192, 4096), MAX_EDGE / 8192);
});

// ---- 仓库层面的契约：切片是「复制源码」，不是包

function sliceSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) files.push(abs);
    }
  };
  walk(path.join(root, "shared"));
  return files;
}

check("shared slices import no third-party packages", () => {
  const allowed = new Set(["node:"]);
  const offenders = [];
  for (const file of sliceSources()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) continue;
      if ([...allowed].some((prefix) => specifier.startsWith(prefix))) continue;
      offenders.push(`${path.relative(root, file)} -> ${specifier}`);
    }
  }
  assert.deepEqual(offenders, [], `unexpected dependencies:\n${offenders.join("\n")}`);
});

check("shared/VERSION is semver", () => {
  const version = readFileSync(path.join(root, "shared", "VERSION"), "utf8").trim();
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});

check("no apps/ or packages/ production containers remain", () => {
  const exists = (rel) => {
    try {
      return statSync(path.join(root, rel)).isDirectory();
    } catch {
      return false;
    }
  };
  assert.equal(exists("apps"), false, "apps/ must be gone — sites live in their own repos");
  if (exists("packages")) {
    assert.deepEqual(readdirSync(path.join(root, "packages")), ["README.md"], "packages/ may only keep a pointer README");
  }
});

console.log(`\n  ${checks} checks passed\n`);
