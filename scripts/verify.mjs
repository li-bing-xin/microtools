#!/usr/bin/env node
/**
 * 共享包冒烟校验：`pnpm verify` 会先 build，再跑这里。
 *
 * 只断言「必须永远成立」的契约，不测 UI：
 * - noindex 与 sitemap 由同一个 live 标志驱动；
 * - canonical / title 不重复品牌后缀；
 * - FAQPage / WebApplication 结构完整，@graph 只有一个 @context；
 * - 大图降采样阈值不被改动。
 */
import assert from "node:assert/strict";
import {
  absoluteUrl,
  buildPageMetadata,
  buildRobots,
  buildSitemap,
  faqPageJsonLd,
  jsonLdGraph,
  renderRobotsTxt,
  renderSitemapXml,
  webApplicationJsonLd,
} from "../packages/seo-kit/dist/index.js";
import { MAX_EDGE, clampScale } from "../packages/editor-core/dist/index.js";

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

console.log(`\n  ${checks} checks passed\n`);
