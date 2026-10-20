/**
 * seo-kit：工具站的 meta / JSON-LD / sitemap / robots 单一真源。
 *
 * 设计约束：
 * - 纯 TS、零运行时依赖，不 import next；
 * - 输出对象是 Next App Router metadata 可接受的结构，站点直接 return；
 * - `live` 标志同时驱动 noindex 与 sitemap 收录，杜绝两处判断漂移。
 */
export type {
  SiteConfig,
  PageMetaInput,
  PageMeta,
  SitemapEntry,
  FaqItem,
  JsonLd,
} from "./types.js";
export { absoluteUrl, fullTitle, buildPageMetadata } from "./metadata.js";
export { faqPageJsonLd, webApplicationJsonLd, jsonLdGraph } from "./jsonld.js";
export type { WebApplicationInput } from "./jsonld.js";
export { buildSitemap, buildRobots, renderSitemapXml, renderRobotsTxt } from "./sitemap.js";
export type { StaticPage, SitemapPage, SitemapInput, RobotsConfig } from "./sitemap.js";
