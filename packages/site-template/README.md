# @microtools/site-template

单用途站点脚手架：**TanStack Router + TanStack Query + React + Vite**。生成时选择渲染模式：

- `--mode spa`（默认）：客户端路由，不做预渲染、不产 sitemap；用于登录后用户端/后台/纯交互工具。
- `--mode prerender`：`src/lib/pages.ts` 里的**显式路由清单**在构建期落盘成静态 HTML，并生成/校验 sitemap；用于需要收录的页面。清单外的路由留在 SPA 侧，支持同站混合。

```bash
pnpm new-site pixelate                                  # SPA（默认）
pnpm new-site pixelate --mode prerender                 # 需要 SEO 的站点
pnpm new-site pixelate --mode prerender --domain https://pixelate.app --name "Pixelate"
# 等价于
node packages/site-template/bin/create-site.mjs pixelate --mode prerender --domain https://pixelate.app
```

生成 `apps/pixelate/`，再 `pnpm install` 即可：

```bash
pnpm --filter pixelate dev
pnpm --filter pixelate build    # 按模式跑构建链 + 渲染模式校验
```

## 模板自带什么

| 文件 | 作用 |
|---|---|
| `src/lib/site.ts` | 站点常量（公开根 URL / basePath / lang）**与 `renderMode`** |
| `src/lib/tool.ts` | 工具页 title / description / H1 / 三步 how-to / `live` 开关 |
| `src/lib/faq.ts` | 3–5 条 FAQ，同一数组喂可见内容与 FAQPage schema |
| `src/lib/pages.ts` | **显式预渲染清单**：预渲染 / head / sitemap 的单一真源 |
| `src/router.tsx` | code-based 路由树（类型安全，无生成文件） |
| `src/routes/not-found.tsx` | 清单外的客户端路由示例（混合模式的写法参考） |
| `src/lib/query.ts` | `QueryClientProvider` + 本地数据 query 示例 |
| `src/lib/head.ts` | 构建期 head 字符串 + 客户端导航 head 同步（SPA 模式统一 noindex） |
| `scripts/prerender-marketing.mjs` | esbuild SSR bundle → 每路由静态 HTML |
| `scripts/verify-prerender-output.mjs` | title / description / canonical / robots / JSON-LD / 正文校验 |
| `scripts/verify-sitemap-coverage.mjs` | sitemap ↔ 产物双向覆盖校验 |
| `scripts/verify-render-mode.mjs` | 模式 ↔ `wrangler.jsonc` ↔ 产物一致性；软 404 红线的自动拦截 |
| `scripts/relocate-base-path.mjs` | SPA 模式子路径部署时搬 index/assets + 改写 `_headers` |
| `scripts/write-deploy-marker.mjs` | `deploy-marker.txt`（git sha），判定「合并 ≠ 上线」 |
| `wrangler.jsonc` + `public/_headers` | Workers Static Assets + 安全头/缓存 |
| `.github/workflows/ci.yml` | 可复制的 `pnpm install → pnpm -r build → pnpm -r typecheck` |

细节（两种模式的构建链、子路径部署、负向校验、混合模式、多语言扩展点）见 [`template/README.md`](template/README.md)。

## 软 404 红线

预渲染站**必须**用 `not_found_handling: "404-page"`；`single-page-application` 只属于 SPA 模式。`verify-render-mode.mjs` 会校验 `src/lib/site.ts` 的 `renderMode` 与 `wrangler.jsonc` 一致，并在 prerender 模式下检查产物没有超出 `pages.ts` 清单，配错直接构建失败。

## 模板故意不给的东西

- 不加 Tailwind / UI 框架：首屏要轻，原生 CSS 足够，也避免 SSR 与 Vite 的 CSS Modules hash 漂移。
- 不做运行时 SSR：预渲染只是构建期的一次 `renderToString`。
- 不生成 OG 图片：不想为一张图引入 satori/sharp；需要时自行放 `public/` 并传 `image`。
- 不预置分析脚本：变现与统计要过成员 gate，代码里先留空。
- 不预置 i18n 框架：单语言跑通，扩展点写进 README。

## `live` 开关（仅 prerender 模式）

`src/lib/tool.ts` 的 `live: false` 同时意味着 `noindex` 与「不进 sitemap」。工具真正可用前不要翻这个开关——空壳页被索引是最贵的返工。SPA 模式不索引任何页面，`live` 不参与 robots 判断。
