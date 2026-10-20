import type { PageMeta, PageMetaInput, SiteConfig } from "./types";

export function absoluteUrl(site: SiteConfig, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = site.url.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function fullTitle(site: SiteConfig, title: string): string {
  return `${title}${site.titleSuffix ?? ` | ${site.name}`}`;
}

/**
 * 每页 <head> 的单一真源：title / description / canonical / robots / OG。
 *
 * - noindex 与 sitemap 由同一个 `live` 标志驱动，避免「已索引但未进 sitemap」
 *   或「空壳页被收录」两类事故。
 * - title 用 `{ absolute }` 打败 layout 的 title.template，否则品牌后缀会重复。
 */
export function buildPageMetadata(site: SiteConfig, page: PageMetaInput): PageMeta {
  const title = fullTitle(site, page.title);
  const canonical = absoluteUrl(site, page.path);
  const imagePath = page.image === undefined ? `${page.path.replace(/\/$/, "")}/opengraph-image` : page.image;
  const image = imagePath === null ? null : absoluteUrl(site, imagePath);

  const meta: PageMeta = {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical },
    openGraph: {
      title,
      description: page.description,
      url: canonical,
      siteName: site.name,
      locale: site.locale ?? "en_US",
      type: page.type ?? "website",
    },
  };

  if (!page.live) meta.robots = { index: false, follow: true };
  if (image) {
    meta.openGraph.images = [{ url: image, width: 1200, height: 630, alt: title }];
    meta.twitter = {
      card: "summary_large_image",
      title,
      description: page.description,
      images: [image],
    };
  }
  return meta;
}
