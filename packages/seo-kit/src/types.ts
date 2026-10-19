/**
 * seo-kit 的输入契约。
 *
 * 这里的输出刻意保持为「Next.js App Router metadata 可接受的普通对象」，
 * 但不 import next：模板/站点可原样 return，也可在别的框架里消费。
 */

/** 站点级常量。url 不带尾斜杠。 */
export interface SiteConfig {
  url: string;
  name: string;
  /** title 后缀，默认 ` | ${name}`。 */
  titleSuffix?: string;
  locale?: string;
  twitter?: string;
}

export interface PageMetaInput {
  /** 站内绝对路径，如 "/blur-face-in-photo"。 */
  path: string;
  /** 不含品牌后缀的页面 title。 */
  title: string;
  description: string;
  /**
   * false → 输出 noindex 且不进 sitemap（空壳页不能被索引）。
   * 只有工具本体可用时才置 true。
   */
  live: boolean;
  /** 默认 `${path}/opengraph-image`（Next 文件约定），传 null 则不输出图片。 */
  image?: string | null;
  type?: "website" | "article";
}

export interface PageMeta {
  title: { absolute: string };
  description: string;
  alternates: { canonical: string };
  robots?: { index: false; follow: true };
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    locale: string;
    type: "website" | "article";
    images?: Array<{ url: string; width: number; height: number; alt: string }>;
  };
  twitter?: { card: "summary_large_image"; title: string; description: string; images?: string[] };
}

export interface SitemapEntry {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** JSON-LD 节点。用 unknown 值域避免把 schema.org 全量类型搬进来。 */
export type JsonLd = Record<string, unknown>;
