# Demo Site

单用途工具站骨架：**TanStack Router + TanStack Query + React + Vite**，构建期把公开路由预渲染成静态 HTML，部署到 Cloudflare Workers Static Assets。

## 命令

```bash
pnpm install          # 同时会通过 seo-kit 的 prepare 构建 @microtools/seo-kit
pnpm dev              # Vite dev server
pnpm build            # 构建 + 预渲染 + sitemap 覆盖率校验（下面细说）
pnpm preview          # vite preview；看预渲染产物请访问带尾斜杠的 /privacy/（不带斜杠是 Vite 的 SPA 回退，线上由 Workers 处理）
pnpm typecheck        # tsc --noEmit
pnpm deploy           # pnpm dlx wrangler@^4 deploy（先 build）
pnpm verify:deploy <sha> --url https://<domain>/deploy-marker.txt
```

`pnpm build` 的流水线（任何一步失败都非零退出）：

| 步骤 | 脚本 | 作用 |
|---|---|---|
| 1 | `write-deploy-marker.mjs` | 写 `public/deploy-marker.txt`（git sha + UTC 时间） |
| 2 | `vite build` | 客户端 bundle → `dist/web` |
| 3 | `prerender-marketing.mjs` | esbuild 打包 `src/ssr.tsx`，逐路由渲染 HTML 并拼 head |
| 4 | `write-static-seo-files.mjs` | 生成 `sitemap.xml` / `robots.txt` |
| 5 | `verify-prerender-output.mjs` | 校验每个路由的 title / description / canonical / robots / JSON-LD / 正文 |
| 6 | `verify-sitemap-coverage.mjs` | sitemap ↔ 产物双向覆盖 |

## 路由：code-based

`src/router.tsx` 里用 `createRootRoute` + `createRoute` 手写路由树，**不引入** `@tanstack/router-plugin`，也没有 `routeTree.gen.ts`。原因：

- 路由数量少（首页 + 法务页），目录约定带来的收益不如「全部路由一眼可见」；
- 路由树就是普通 TS，`tsc --noEmit` 能完整检查，类型注册在 `declare module` 里；
- 少一个构建期插件，预渲染用的 esbuild bundle 和 Vite 看到的是同一份代码。

加一个页面：

1. `src/lib/pages.ts` 加一条 `PageDefinition`（path / title / description / live / sitemap）；
2. `src/routes/<name>.tsx` 写组件，开头调 `usePageHead(page)`；
3. `src/router.tsx` 加 `createRoute` 并挂到 `routeTree`。

## 目录

```
src/
  main.tsx          # 客户端入口：先 router.load() 再 hydrateRoot
  ssr.tsx           # 预渲染入口（esbuild 打成 CJS 给 Node 跑）
  router.tsx        # 路由树 + createAppRouter
  routes/           # 页面组件（root = header/main/footer）
  lib/site.ts       # 域名 / basePath / lang
  lib/tool.ts       # 工具页文案（title / H1 / 三步 / live）
  lib/faq.ts        # 3–5 条 FAQ，同一数组喂可见内容与 FAQPage
  lib/pages.ts      # 公开路由清单：预渲染 / head / sitemap 的单一真源
  lib/head.ts       # head 生成（构建期字符串 + 运行时 applyHead）
  lib/query.ts      # QueryClient + 本地数据示例
  styles/globals.css
scripts/            # 构建、预渲染、SEO 校验、部署 marker
public/_headers     # 安全头 + 缓存
wrangler.jsonc      # Workers Static Assets
```

## SEO：构建期静态 HTML

- **`live` 是唯一开关**：`live: false` 同时输出 `noindex, follow` 且不进 sitemap（由 `@microtools/seo-kit` 保证）。工具没做完之前别翻。
- **head 单一真源**：`src/lib/head.ts` 的 `buildHead()` 同时被预渲染脚本和客户端 `usePageHead()` 使用。静态 HTML 里的 title/description/canonical 与 SPA 导航后一致。
- **JSON-LD**：每个页面至少一条 `WebPage`；首页再加 `WebApplication` + `FAQPage`（`@graph` 合并），FAQ 与可见内容用同一个数组。
- 不依赖客户端 JS：`curl` 任一预渲染路由就能看到 `<h1>` 与正文。

校验（构建会自动跑）：

```bash
node scripts/verify-prerender-output.mjs
node scripts/verify-sitemap-coverage.mjs
```

负向验证（应当非零退出）：

```bash
# 删掉一条产物
rm dist/web/index.html && node scripts/verify-sitemap-coverage.mjs   # -> 1

# 往 sitemap 里加一条不存在的 URL
sed -i '' 's#</urlset>#  <url><loc>https://<domain>/nope</loc></url>\n</urlset>#' dist/web/sitemap.xml
node scripts/verify-sitemap-coverage.mjs                             # -> 1
```

**故意不做**：运行时 SSR、i18n 框架、OG 图片生成（`buildHead` 里 `image: null`；需要时把图片放 `public/` 并传 image 路径）、分析脚本。

## 子路径部署

`src/lib/site.ts` 的 `site.url` 写完整公开根 URL：

```ts
const rawUrl = "https://example.com/tools";
```

`basePath` 由 pathname 自动推导，Vite `base`、Router `basepath`、canonical、sitemap 全部跟着变。预渲染会把产物写到 `dist/web/tools/`，并把 `_headers` 的 `/assets/*` 改写成 `/tools/assets/*`；`_headers` 本身留在 assets 根（Workers 约定）。根域部署保持 `https://example.com` 即可。

## 部署

```bash
pnpm build
pnpm deploy            # pnpm dlx wrangler@^4 deploy
```

`wrangler.jsonc` 只托管 `dist/web` 静态资源，`html_handling: auto-trailing-slash` 让 `/privacy` 与 `/privacy/` 都落到 `privacy/index.html`；未知路径直接 404，不做 SPA 回退——漏预渲染就该 404，而不是悄悄回首页。

上线判定：

```bash
curl https://<domain>/deploy-marker.txt
# Demo Site deploy marker
# git_sha=<sha>
# released_at_utc=<iso>

node scripts/verify-deploy.mjs <sha> --url https://<domain>/deploy-marker.txt
```

## CI

`pnpm install --frozen-lockfile` → `pnpm -r build` → `pnpm -r typecheck`。模板自带 `.github/workflows/ci.yml`，是站点仓库的标准 CI（`pnpm install` → `pnpm -r build` → `pnpm -r typecheck`）。在 microtools monorepo 里由根 workflow 统一执行；站点连同 `seo-kit` 一起独立成仓库时，把这份文件放到仓库根即可。

## 多语言

模板只跑单语言（`site.lang = "en"`，`siteConfig.locale = "en_US"`）。要加语言时：

1. 路由树加 `/$locale` 分支（或为每种语言建独立路由树），`site.basePath` 之外再加 locale 前缀；
2. `PageDefinition` 增加 locale 维度（title/description/JSON-LD 都按语言给）；
3. 预渲染脚本改成 `locale × pages` 双层循环，sitemap 相应加 hreflang。

不预置 i18n 框架：没有真实第二语言之前，任何 i18n 抽象都是猜的。

## 不要做的事

- 不要在工具不可用时置 `live: true`（空壳页被索引是最贵的返工）。
- 不要引入 Tailwind / UI 框架（首屏要轻，样式就用 `globals.css`）。
- 不要改成运行时 SSR（标准是构建期预渲染；确需服务端渲染要先拍板）。
- 不要把 `deploy-marker.txt` 提交进 git（每次构建生成）。
