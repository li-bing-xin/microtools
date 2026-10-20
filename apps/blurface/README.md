# Blurface

TanStack Router + TanStack Query + React + Vite 的单用途站点。**渲染模式在生成时选择**：默认 SPA，需要被搜索引擎收录时才用预渲染。

## 两种模式

| | `spa`（默认） | `prerender` |
|---|---|---|
| 适用 | 登录后用户端、后台、纯交互工具 | 需要收录的公开页 / 站点 |
| 路由 | 客户端 | 客户端 + `src/lib/pages.ts` 里的路由构建期落盘 |
| `dist/web` | 只有 `index.html` + `assets`（另有 `_headers` / `deploy-marker`） | 每个清单路由一个 `index.html` + `sitemap.xml` / `robots.txt` |
| `not_found_handling` | `single-page-application` | `404-page`（未知路径真 404） |
| sitemap | 无 | 构建期生成 + 双向覆盖率校验 |

**红线**：预渲染站绝不能配 `single-page-application`——那会让任意 URL 返回 200，变成软 404。`scripts/verify-render-mode.mjs` 在每次构建的最后一步校验模式与 `wrangler.jsonc` 一致，配错直接非零退出。

```bash
# 生成时二选一
node packages/site-template/bin/create-site.mjs my-app --mode spa
node packages/site-template/bin/create-site.mjs my-app --mode prerender
```

## 命令

```bash
pnpm install          # 同时会通过 seo-kit 的 prepare 构建 @microtools/seo-kit
pnpm dev              # Vite dev server
pnpm build            # 按模式跑构建链（见下）
pnpm preview          # vite preview
pnpm typecheck        # tsc --noEmit
pnpm deploy           # pnpm dlx wrangler@^4 deploy（先 build）
pnpm verify:deploy <sha> --url https://<domain>/deploy-marker.txt
```

构建链（`package.json` 的 `build` 由 create-site 按模式写入）：

| 模式 | 步骤 |
|---|---|
| `spa` | `write-deploy-marker` → `vite build` → `relocate-base-path` → `verify-render-mode` |
| `prerender` | `write-deploy-marker` → `vite build` → `prerender-marketing` → `write-static-seo-files` → `verify-prerender-output` → `verify-sitemap-coverage` → `verify-render-mode` |

`prerender-marketing.mjs` 用 esbuild 把 `src/ssr.tsx` 打成 CJS（React 19 的 server renderer 是 CJS），逐路由 `renderToString`，head 由 `@microtools/seo-kit` 生成，再拼出完整文档。

## 路由：code-based

`src/router.tsx` 用 `createRootRoute` + `createRoute` 手写路由树，**不引入** `@tanstack/router-plugin`，也没有 `routeTree.gen.ts`：

- 路由数量少（首页 + 法务页），目录约定收益不如「全部路由一眼可见」；
- 路由树就是普通 TS，`tsc --noEmit` 能完整检查，类型注册在 `declare module` 里；
- 预渲染用的 esbuild bundle 和 Vite 看到的是同一份代码。

加一个页面：`src/lib/pages.ts` 加一条 `PageDefinition` → `src/routes/` 写组件（开头调 `usePageHead`）→ `src/router.tsx` 挂路由。

### 预渲染清单是显式列表（混合模式）

`src/lib/pages.ts` 的 `pages` 是**一份显式清单**，不是「router 里的所有路由」。这正是混合模式需要的能力：

- 公开页放清单 → 预渲染 + 进 sitemap；
- 私有页（例如 `/app/...`）只挂 `router.tsx`、**不**放清单 → 留在 SPA bundle 里，客户端导航正常；
- `src/routes/not-found.tsx` 就是清单外的客户端路由示例。

预渲染模式下，未进清单的路径直接访问会得到 Workers 的真 404（`404-page`）。如果私有路由也需要深链可用，需要给这些前缀加一个 Worker 回退（本模板不内置，属于下一层架构决定）。

## SEO（仅 prerender 模式）

- **`live` 是索引开关**：`live: false` 同时输出 `noindex, follow` 且不进 sitemap（seo-kit 保证）。工具没做完之前别翻。
- **head 单一真源**：`src/lib/head.ts` 的 `buildHead()` 同时被预渲染脚本和客户端 `usePageHead()` 使用；静态 HTML 与 SPA 导航后的 title/description/canonical 一致。
- **SPA 模式统一 noindex**：即使页面 `live: true` 也不索引，避免 app shell 被收录。
- **JSON-LD**：每个清单页至少一条 `WebPage`；首页再加 `WebApplication + FAQPage`（`@graph` 合并），FAQ 与可见内容用同一个数组。
- 不依赖客户端 JS：`curl` 任一预渲染路由都能看到 `<h1>` 与正文。

校验（prerender 构建里自动跑）：

```bash
node scripts/verify-prerender-output.mjs
node scripts/verify-sitemap-coverage.mjs
node scripts/verify-render-mode.mjs
```

负向验证（都应当非零退出）：

```bash
# 删掉一条产物
rm dist/web/index.html && node scripts/verify-sitemap-coverage.mjs

# 往 sitemap 里加一条不存在的 URL
sed -i '' 's#</urlset>#  <url><loc>https://<domain>/nope</loc></url>\n</urlset>#' dist/web/sitemap.xml
node scripts/verify-sitemap-coverage.mjs

# 软 404 红线：把 prerender 站的 wrangler 改成 SPA 回退
sed -i '' 's/"404-page"/"single-page-application"/' wrangler.jsonc
node scripts/verify-render-mode.mjs
```

**故意不做**：运行时 SSR、i18n 框架、OG 图片生成（`buildHead` 里 `image: null`；需要时把图片放 `public/` 并传 image 路径）、分析脚本。

## 子路径部署（两种模式都支持）

`src/lib/site.ts` 的 `site.url` 写完整公开根 URL：

```ts
const rawUrl = "https://example.com/tools";
```

`basePath` 由 pathname 自动推导，Vite `base`、Router `basepath`、canonical、sitemap 全部跟着变。构建会：

- 把 `index.html` / `assets` / public 文件搬进 `dist/web/tools/`；
- 把 `_headers` 的 `/assets/*` 改写成 `/tools/assets/*`，`_headers` 本身留在 assets 根（Workers 约定）。

根域部署保持 `https://example.com` 即可。

## 部署

```bash
pnpm build
pnpm deploy            # pnpm dlx wrangler@^4 deploy
```

`wrangler.jsonc` 的 `not_found_handling` 由模式决定（见上）。`pnpm preview` 对无尾斜杠路径会做 Vite 的 SPA 回退：在 prerender 模式下看静态页请用 `/privacy/`，线上由 Workers 的 `auto-trailing-slash` 处理两种写法。

上线判定：

```bash
curl https://<domain>/deploy-marker.txt
# Blurface deploy marker
# git_sha=<sha>
# released_at_utc=<iso>

node scripts/verify-deploy.mjs <sha> --url https://<domain>/deploy-marker.txt
```

## CI

`pnpm install --frozen-lockfile` → `pnpm -r build` → `pnpm -r typecheck`。模板自带 `.github/workflows/ci.yml`，是站点仓库的标准 CI。在 microtools monorepo 里由根 workflow 统一执行；站点连同 `seo-kit` 一起独立成仓库时，把这份文件放到仓库根即可。

## 多语言

模板只跑单语言（`site.lang = "en"`，`siteConfig.locale = "en_US"`）。要加语言时：路由树加 locale 分支，`PageDefinition` 增加 locale 维度，预渲染脚本改成 `locale × pages` 两层循环，sitemap 加 hreflang。不预置 i18n 框架：没有真实第二语言之前，任何 i18n 抽象都是猜的。

## 不要做的事

- **不要把 `single-page-application` 配到 prerender 站点**（软 404；`verify-render-mode` 会拦）。
- 不要在工具不可用时置 `live: true`（空壳页被索引是最贵的返工）。
- 不要引入 Tailwind / UI 框架（首屏要轻，样式就用 `globals.css`）。
- 不要改成运行时 SSR（标准是构建期预渲染；确需服务端渲染要先拍板）。
- 不要把 `deploy-marker.txt` 提交进 git（每次构建生成）。
