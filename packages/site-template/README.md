# @microtools/site-template

单用途工具站脚手架：**TanStack Router + TanStack Query + React + Vite**，构建期预渲染全部公开路由，产物是纯静态文件。

```bash
pnpm new-site pixelate                                  # 域名先用 https://pixelate.example.com 占位
pnpm new-site pixelate --domain https://pixelate.app --name "Pixelate"
# 等价于
node packages/site-template/bin/create-site.mjs pixelate --domain https://pixelate.app --name "Pixelate"
```

生成 `apps/pixelate/`，再 `pnpm install` 即可：

```bash
pnpm --filter pixelate dev      # Vite dev server
pnpm --filter pixelate build    # build + 预渲染 + sitemap 覆盖率校验
```

## 模板自带什么

| 文件 | 作用 |
|---|---|
| `src/lib/site.ts` | 站点常量（公开根 URL / basePath / lang） |
| `src/lib/tool.ts` | 工具页 title / description / H1 / 三步 how-to / `live` 开关 |
| `src/lib/faq.ts` | 3–5 条 FAQ，同一数组喂可见内容与 FAQPage schema |
| `src/lib/pages.ts` | 公开路由清单：预渲染 / head / sitemap 的单一真源 |
| `src/router.tsx` | code-based 路由树（类型安全，无生成文件） |
| `src/lib/query.ts` | `QueryClientProvider` + 本地数据 query 示例 |
| `src/lib/head.ts` | 构建期 head 字符串 + 客户端导航 head 同步 |
| `scripts/prerender-marketing.mjs` | esbuild SSR bundle → 每路由静态 HTML |
| `scripts/verify-prerender-output.mjs` | title / description / canonical / robots / JSON-LD / 正文校验 |
| `scripts/verify-sitemap-coverage.mjs` | sitemap ↔ 产物双向覆盖校验（对不上就红） |
| `scripts/write-deploy-marker.mjs` | `deploy-marker.txt`（git sha），判定「合并 ≠ 上线」 |
| `wrangler.jsonc` + `public/_headers` | Workers Static Assets + 安全头/缓存 |
| `.github/workflows/ci.yml` | 可复制的 `pnpm install → pnpm -r build → pnpm -r typecheck` |

细节（路由为什么用 code-based、子路径部署、负向校验、多语言扩展点）见 [`template/README.md`](template/README.md)。

## 模板故意不给的东西

- 不加 Tailwind / UI 框架：首屏要轻，原生 CSS 足够，也避免 SSR 与 Vite 的 CSS Modules hash 漂移。
- 不做运行时 SSR：标准是构建期预渲染。
- 不生成 OG 图片：不想为一张图引入 satori/sharp；需要时自行放 `public/` 并传 `image`。
- 不预置分析脚本：变现与统计要过成员 gate，代码里先留空。
- 不预置 i18n 框架：单语言跑通，扩展点写进 README。

## `live` 开关

`src/lib/tool.ts` 的 `live: false` 同时意味着 `noindex` 与「不进 sitemap」。工具真正可用前不要翻这个开关——空壳页被索引是最贵的返工。
