import type { SiteConfig } from "@microtools/seo-kit";

/** 站点级常量。域名绑定属于 gate 3：换域名前先改这里，再提批准。 */
export const site: SiteConfig = {
  url: "__SITE_URL__",
  name: "__SITE_NAME__",
  locale: "en_US",
};
