# shared/seo

每个工具站的 meta / JSON-LD / sitemap / robots 单一真源。纯 TS、零依赖、不 import 任何框架。随 `shared/` 复制进站点 `src/shared/seo/`。

**这是复制切片，不是 npm 包**：站点里 `import { buildPageMetadata } from "@/shared/seo";`，没有 `@microtools/*` 依赖。

## 为什么存在

blurface 上线时踩过的两类事故，这里在类型层面堵住：

1. **空壳页被索引**：`live` 标志同时决定 `<meta robots=noindex>` 和是否进 sitemap，不可能只做一半。
2. **title / canonical 漂移**：每页 head 由 `buildPageMetadata` 生成，layout 只用 `title.template` 兜底，页面一律给 `{ absolute }`。
3. **结构化数据与可见内容不一致**：`faqPageJsonLd` 接的就是渲染可见 FAQ 的同一个数组。

## API

```ts
import {
  buildPageMetadata, faqPageJsonLd, webApplicationJsonLd, jsonLdGraph,
  buildSitemap, renderSitemapXml, buildRobots, renderRobotsTxt,
} from "@/shared/seo";

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

## 框架关系

输出刻意保持框架无关：

- `buildPageMetadata` 的返回结构是 Next App Router `Metadata` 可接受的值，`buildSitemap` 同 `MetadataRoute.Sitemap`；Next 站点直接 return，不需要 adapter。
- Vite/TanStack 站点（`template/`）在构建期调用 `buildPageMetadata` + `renderSitemapXml` / `renderRobotsTxt` 落盘：见 `src/lib/head.ts` 与 `src/ssr.tsx` 的 `getSeoFiles()`。

## 校验

microtools 仓库根跑 `npm test` 会先编译本切片再执行契约冒烟（canonical、noindex、sitemap 收录、JSON-LD 结构）。改这里必须让 `npm test` 保持绿。
