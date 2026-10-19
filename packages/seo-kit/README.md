# @microtools/seo-kit

每个工具站的 meta / JSON-LD / sitemap / robots 单一真源。纯 TS、零依赖、不 import next。

## 为什么存在

blurface 上线时踩过的两类事故，这个包在类型层面堵住：

1. **空壳页被索引**：`live` 标志同时决定 `<meta robots=noindex>` 和是否进 sitemap，不可能只做一半。
2. **title / canonical 漂移**：每页 head 由 `buildPageMetadata` 生成，layout 只用 `title.template` 兜底，页面一律给 `{ absolute }`。
3. **结构化数据与可见内容不一致**：`faqPageJsonLd` 接的就是渲染可见 FAQ 的同一个数组。

## API

```ts
import {
  buildPageMetadata, faqPageJsonLd, webApplicationJsonLd, jsonLdGraph,
  buildSitemap, renderSitemapXml, buildRobots,
} from "@microtools/seo-kit";

const site = { url: "https://example.com", name: "Example" };

export const metadata = buildPageMetadata(site, {
  path: "/pixelate-image",
  title: "Pixelate Image Online Free",
  description: "…",
  live: false, // 工具不可用前保持 noindex，且不进 sitemap
});

export const sitemap = () => buildSitemap(site, {
  staticPages: [{ path: "/", priority: 1 }, { path: "/privacy", priority: 0.3 }],
  pages: tools.map((t) => ({ path: t.path, live: t.live })),
});
```

## 与 Next 的关系

输出结构是 Next App Router `Metadata` / `MetadataRoute.Sitemap` 可接受的值，直接 return 即可，不需要 adapter。若将来换框架，包本身不变，只换薄壳。
