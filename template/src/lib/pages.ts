import {
  absoluteUrl,
  buildRobots,
  buildSitemap,
  faqPageJsonLd,
  fullTitle,
  jsonLdGraph,
  renderRobotsTxt,
  renderSitemapXml,
  webApplicationJsonLd,
  type JsonLd,
  type SiteConfig,
  type SitemapEntry,
} from "@/shared/seo";
import { faq } from "./faq";
import { tool } from "./tool";

/**
 * 公开路由清单：预渲染、head、sitemap 三处共用这一份数据。
 *
 * 加一个页面 = 这里加一条 + src/routes/ 加组件 + router.tsx 挂路由。
 * `live: false` 同时意味着 noindex 与不进 sitemap（`@/shared/seo` 的单一 `live` 标志）。
 */
export interface PageDefinition {
  path: string;
  /** 不含品牌后缀的 title；最终 title 由 shared/seo 拼。 */
  title: string;
  description: string;
  live: boolean;
  sitemap: {
    priority: number;
    changeFrequency: NonNullable<SitemapEntry["changeFrequency"]>;
  };
  /** 页面级结构化数据。每个页面至少给一条 WebPage；工具页再加 WebApplication。 */
  jsonLd?: (site: SiteConfig) => JsonLd;
}

/** 普通内容页的最小结构化数据：WebPage + 所属 WebSite。 */
function webPageJsonLd(
  site: SiteConfig,
  page: { path: string; title: string; description: string },
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: fullTitle(site, page.title),
    description: page.description,
    url: absoluteUrl(site, page.path),
    isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
  };
}

function staticPage(input: {
  path: string;
  title: string;
  description: string;
}): PageDefinition {
  return {
    ...input,
    live: true,
    sitemap: { priority: 0.3, changeFrequency: "yearly" },
    jsonLd: (site) => webPageJsonLd(site, input),
  };
}

export const homePage: PageDefinition = {
  path: tool.path,
  title: tool.title,
  description: tool.description,
  live: tool.live,
  sitemap: { priority: 1, changeFrequency: "weekly" },
  // FAQ 用的是渲染可见 FAQ 的同一个数组，结构化数据不会和正文漂移。
  jsonLd: (site) =>
    jsonLdGraph([
      webApplicationJsonLd({
        name: tool.title,
        description: tool.description,
        url: absoluteUrl(site, tool.path),
        featureList: ["Runs entirely in the browser", "No watermark", "No sign-up"],
      }),
      faqPageJsonLd(faq),
    ]),
};

export const privacyPage = staticPage({
  path: "/privacy",
  title: "Privacy Policy",
  description:
    "What this site does with your files: everything is processed in your browser, nothing is uploaded, and no account is required.",
});

export const termsPage = staticPage({
  path: "/terms",
  title: "Terms of Use",
  description:
    "The short terms for using this free browser tool: no warranty, no account, and you keep full rights to the files you process.",
});

export const pages: readonly PageDefinition[] = [homePage, privacyPage, termsPage];

export function getPage(path: string): PageDefinition {
  const page = pages.find((candidate) => candidate.path === path);
  if (!page) {
    throw new Error(
      `Unknown page "${path}". Known pages: ${pages.map((candidate) => candidate.path).join(", ")}`,
    );
  }
  return page;
}

/** 静态产物路径："/" -> index.html，"/privacy" -> privacy/index.html。 */
export function outputPathFor(path: string): string {
  if (path === "/") return "index.html";
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return `${trimmed}/index.html`;
}

/**
 * sitemap / robots 的构建期输入：只收录 live 页面。
 *
 * 放在这里（而不是构建脚本里）的原因：脚本是 .mjs，不能直接 import TS 切片；
 * 由 src/ssr.tsx 暴露 getSeoFiles() 给脚本，SEO 规则就始终只有这一份实现。
 */
export function buildSeoFiles(site: SiteConfig, lastModified: Date = new Date()): { sitemap: string; robots: string } {
  const entries = buildSitemap(site, {
    staticPages: pages
      .filter((page) => page.live)
      .map((page) => ({
        path: page.path,
        priority: page.sitemap.priority,
        changeFrequency: page.sitemap.changeFrequency,
      })),
    lastModified,
  });
  return { sitemap: renderSitemapXml(entries), robots: renderRobotsTxt(buildRobots(site)) };
}
