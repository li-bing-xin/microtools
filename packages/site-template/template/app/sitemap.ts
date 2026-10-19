import type { MetadataRoute } from "next";
import { buildSitemap } from "@microtools/seo-kit";
import { site } from "@/lib/site";
import { tool } from "@/lib/tool";

/** 只有 live 页面进 sitemap；noindex 的空壳页永远不在这里。 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(site, {
    staticPages: [{ path: "/privacy", changeFrequency: "yearly", priority: 0.3 }],
    pages: [{ path: tool.path, live: tool.live, priority: 1 }],
  });
}
