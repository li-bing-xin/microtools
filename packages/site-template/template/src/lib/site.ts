import type { SiteConfig } from "@microtools/seo-kit";

/**
 * 站点级常量。域名绑定属于 gate 3：换域名/换子路径前先改这里，再提批准。
 *
 * __SITE_URL__ 是公开根 URL，不带尾斜杠。根域部署写 https://example.com；
 * 子路径部署把子路径一起写进来（https://example.com/tools），
 * Vite base、Router basepath、canonical、sitemap 都会自动带上它。
 */
const rawUrl = "__SITE_URL__";

function normalizeBasePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : `${trimmed}/`;
}

/**
 * 渲染模式：
 * - "spa"（默认）：客户端路由，不做预渲染，也没有 sitemap；用于登录后用户端/后台/纯交互工具。
 * - "prerender"：src/lib/pages.ts 里的公开路由在构建期落盘成静态 HTML + sitemap。
 * 预渲染清单是显式列表，不是"所有路由"；未列出的路由留在 SPA 侧（混合模式）。
 */
export type RenderMode = "spa" | "prerender";
export const renderMode: RenderMode = "__RENDER_MODE__";

export const site = {
  url: rawUrl,
  name: "__SITE_NAME__",
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
