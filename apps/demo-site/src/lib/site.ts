import type { SiteConfig } from "@microtools/seo-kit";

/**
 * 站点级常量。域名绑定属于 gate 3：换域名/换子路径前先改这里，再提批准。
 *
 * https://demo-site.example.com 是公开根 URL，不带尾斜杠。根域部署写 https://example.com；
 * 子路径部署把子路径一起写进来（https://example.com/tools），
 * Vite base、Router basepath、canonical、sitemap 都会自动带上它。
 */
const rawUrl = "https://demo-site.example.com";

function normalizeBasePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : `${trimmed}/`;
}

export const site = {
  url: rawUrl,
  name: "Demo Site",
  /** <html lang>。seo-kit 的 locale 是 OG locale（en_US），两者含义不同。 */
  lang: "en",
  /** Vite base 与 Router basepath，由 url 推导，不用手改。 */
  basePath: normalizeBasePath(new URL(rawUrl).pathname),
} as const;

/** seo-kit 的输入。url 含子路径，canonical / sitemap 自动带前缀。 */
export const siteConfig: SiteConfig = {
  url: site.url,
  name: site.name,
  locale: "en_US",
};
