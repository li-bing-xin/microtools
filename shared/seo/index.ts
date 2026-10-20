/**
 * seo 切片：工具站的 meta / JSON-LD / sitemap / robots 单一真源。
 *
 * 随 microtools 的 `shared/` 复制进站点 `src/shared/seo/`（不打包、不发 npm）。
 * 设计约束：
 * - 纯 TS、零运行时依赖，不 import 任何框架；
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
} from "./types";
export { absoluteUrl, fullTitle, buildPageMetadata } from "./metadata";
export { faqPageJsonLd, webApplicationJsonLd, jsonLdGraph } from "./jsonld";
export type { WebApplicationInput } from "./jsonld";
export { buildSitemap, buildRobots, renderSitemapXml, renderRobotsTxt } from "./sitemap";
export type { StaticPage, SitemapPage, SitemapInput, RobotsConfig } from "./sitemap";
