import type { SitemapEntry, SiteConfig } from "./types";
import { absoluteUrl } from "./metadata";

export interface StaticPage {
  path: string;
  changeFrequency?: SitemapEntry["changeFrequency"];
  priority?: number;
}

export interface SitemapPage {
  path: string;
  live: boolean;
  changeFrequency?: SitemapEntry["changeFrequency"];
  priority?: number;
}

export interface SitemapInput {
  staticPages: StaticPage[];
  /** 工具页/内容页；只有 live === true 的进 sitemap。 */
  pages?: SitemapPage[];
  /** 固定构建时间，便于测试与稳定 diff。 */
  lastModified?: string | Date;
}

/**
 * 只收录可索引页面：noindex 的工具页不进 sitemap。
 * 与 buildPageMetadata 的 `live` 共享同一标志，杜绝两处判断漂移。
 */
export function buildSitemap(site: SiteConfig, input: SitemapInput): SitemapEntry[] {
  const lastModified = input.lastModified ?? new Date();
  const entries: SitemapEntry[] = [];
  for (const page of input.staticPages) {
    entries.push({
      url: absoluteUrl(site, page.path),
      lastModified,
      changeFrequency: page.changeFrequency ?? "weekly",
      priority: page.priority ?? 0.5,
    });
  }
  for (const page of input.pages ?? []) {
    if (!page.live) continue;
    entries.push({
      url: absoluteUrl(site, page.path),
      lastModified,
      changeFrequency: page.changeFrequency ?? "weekly",
      priority: page.priority ?? 0.8,
    });
  }
  return entries;
}

export interface RobotsConfig {
  rules: { userAgent: string; allow: string; disallow?: string[] };
  sitemap: string;
}

/** robots.txt 的结构化描述：全站可抓，sitemap 指向规范域名。 */
export function buildRobots(site: SiteConfig, options?: { disallow?: string[] }): RobotsConfig {
  const rules: RobotsConfig["rules"] = {
    userAgent: "*",
    allow: "/",
  };
  if (options?.disallow?.length) rules.disallow = options.disallow;
  return { rules, sitemap: absoluteUrl(site, "/sitemap.xml") };
}

/**
 * robots.txt 序列化（不依赖 Next）。Next 的 `robots.ts` 直接 return buildRobots()
 * 的输出；Vite/静态站由构建脚本调用本函数写文件。
 */
export function renderRobotsTxt(robots: RobotsConfig): string {
  const lines = [`User-agent: ${robots.rules.userAgent}`, `Allow: ${robots.rules.allow}`];
  for (const path of robots.rules.disallow ?? []) lines.push(`Disallow: ${path}`);
  lines.push("", `Sitemap: ${robots.sitemap}`, "");
  return lines.join("\n");
}

/**
 * sitemap.xml 序列化（不依赖 Next）。时间统一 ISO 日期，符合 sitemap 协议。
 */
export function renderSitemapXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`];
      if (entry.lastModified) {
        const d = entry.lastModified instanceof Date ? entry.lastModified : new Date(entry.lastModified);
        parts.push(`    <lastmod>${d.toISOString().slice(0, 10)}</lastmod>`);
      }
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (entry.priority !== undefined) parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
