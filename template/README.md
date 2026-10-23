# __SITE_NAME__

TanStack Router + TanStack Query + React + Vite 的单用途站点。**渲染模式在生成时选择**：默认 SPA，需要被搜索引擎收录时才用预渲染。

## 两种模式

| | `spa`（默认） | `prerender` |
|---|---|---|
| 适用 | 登录后用户端、后台、纯交互工具 | 需要收录的公开页 / 站点 |
| 路由 | 客户端 | 客户端 + `src/lib/pages.ts` 里的路由构建期落盘 |
| `dist/web` | 只有 `index.html` + `assets`（另有 `_headers` / `deploy-marker`） | 每个清单路由一个 `index.html` + `sitemap.xml` / `robots.txt` |
| `not_found_handling` | `single-page-application` | `404-page`（未知路径真 404） |
| sitemap | 无 | 构建期生成 + 双向覆盖率校验 |

**红线**：预渲染站绝不能配 `single-page-application`——那会让任意 URL 返回 200，变成软 404。`scripts/verify-render-mode.mjs` 在每次构建的最后一步校验模式与 `cloudflare.config.ts` 一致，配错直接非零退出。

```bash
# 在 microtools 仓库里生成（默认落到同级目录 ../my-app，每个站点独立成仓）
node bin/create-site.mjs my-app --mode spa
node bin/create-site.mjs my-app --mode prerender --domain https://my-app.example.com --name "My App"
```

生成时会把 microtools 的 `shared/` 整棵复制成 `src/shared/`（含 `VERSION`），并在站点根写
`.shared-upstream`（上游 git 地址）。此后共享代码只通过同步器升级，站点里不手改。

## 命令

```bash
npm install           # 或 pnpm install，站点是独立包，没有 workspace 协议
npm run dev           # Vite dev server
npm run build         # 按模式跑构建链（见下）
npm run preview       # vite preview
npm run typecheck     # tsc --noEmit（覆盖 src/shared/）
npm test              # shared 边界自检 + rng 冒烟（VERSION / 切片入口 / 无 @microtools/* 导入）
npm run sync:check    # 上游 shared 是否有新版本
npm run deploy        # cf deploy（自己跑完整构建链，不用先 build）
npm run deploy:dry-run
npm run verify:deploy -- <sha> --url https://<domain>/deploy-marker.txt
node scripts/verify-print-fit.mjs   # 打印实测（要本机 Chrome；见下）
```

构建链（`package.json` 的 `build` 由 create-site 按模式写入）：

| 模式 | 步骤 |
|---|---|
| `spa` | `write-deploy-marker` → `vite build` → `relocate-base-path` → `verify-render-mode` |
| `prerender` | `write-deploy-marker` → `vite build` → `prerender-marketing` → `write-static-seo-files` → `verify-prerender-output` → `verify-sitemap-coverage` → `verify-render-mode` |

`prerender-marketing.mjs` 用 esbuild 把 `src/ssr.tsx` 打成 CJS（React 19 的 server renderer 是 CJS），逐路由 `renderToString`，head 由 `src/shared/seo` 生成，再拼出完整文档。sitemap/robots 也由同一个 SSR bundle 的 `getSeoFiles()` 算出，脚本本身不 import TS。

## 共享代码：`src/shared`（复制，不是包）

生成时 `microtools/shared/` 整棵复制到本站 `src/shared/`，`VERSION` 记录来源版本；站内 `import { buildPageMetadata } from "@/shared/seo"` / `"@/shared/render"`，**没有** `@microtools/*` 依赖。

```bash
npm test                                # 校验 VERSION / 切片入口 / 无 @microtools/* 导入
node scripts/sync-shared.mjs --check    # 上游是否有新版本（落后 exit 1）
node scripts/sync-shared.mjs --to 1.1.0 # 升级：覆盖 src/shared + 跑 build/test，失败自动回滚
node scripts/sync-shared.mjs --to 1.1.0 --dry-run   # 只看将变更的文件
```

- **站内不要手改 `src/shared/`**：要改回 microtools 改、打 tag `v<VERSION>`、再同步。
- 有意分叉：放 `src/shared/DIVERGED.md` 写明原因与归并计划；`--check` 会跳过，`--to` 会拒绝。
- 协议全文：microtools 的 `docs/shared-protocol.md`。

## 站内链接单一真源：`src/lib/link-graph.ts`

页脚 / 顶部导航的链接都从 `TOOL_LINKS` 取（`tool.ts` 的 `navLabel`）。长出第二个、第三个工具页时
把路径加进 `link-graph.ts` 的清单，导航和页脚自动出现——不会出现「发了新页但全站没有入口」的孤岛。
`ALL_SITE_PATHS` / `isSitePath` 给链接渲染做兜底校验。（约定自 printable-studio 回灌，BING-89 B2。）

## 生成器约定（要做"生成器"类工具时照这份来）

- **确定性随机**：所有题面/布局生成共用 `src/lib/rng.ts`（mulberry32 + `deriveSeed` 盐派生 +
  不改入参的 `shuffled`）。同一 seed 永远得到同一结果——预渲染与 hydration 都靠这一点。
  生成器禁止用 `Math.random`（用 `nextSeed()` 那样的入口抽一次 seed 再派生）。
- **独立校验**：每个生成器配一个 `verify*` 纯函数（如 `verifyPuzzle`），重算合法性，
  测试与答案页共用——不让生成逻辑自己说自己对。
- **显式降级**：出不了就明说（`wordsShort` / `unplaced` 带原因），UI 必须提示，不静默吞。
- `tests/rng.test.ts` 是共享 PRNG 的冒烟；每个生成器再加自己的测试文件。
- 接了打印输出的生成器，`scripts/verify-print-fit.mjs` 必须加 target：默认档 + worst-case 档
  （单页截断高发在极端合法配置；参考 printable-studio 的三组 worst-case）。

## 打印层（`PrintDocument` + `print.css`）

`src/components/PrintDocument.tsx` + `src/styles/print.css` 提供「题面 + 答案分离」的两页式打印：
页面里渲染 `<PrintDocument paper={paper}>`，每个打印页一个 `<article className="sheet">`，
答案页加 `.sheet--answers` 独立成页；`PrintFoot` 的站址从 `site.url` 推导，换域名不用改组件。
不需要打印输出的站，`create-site.mjs --print off` 生成时不带这套。
第二个消费方出现时按 BING-47 协议收进 `shared/` 打 tag。

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

- **`live` 是索引开关**：`live: false` 同时输出 `noindex, follow` 且不进 sitemap（`src/shared/seo` 保证）。工具没做完之前别翻。
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

# 软 404 红线：把 prerender 站的 notFoundHandling 改成 SPA 回退
sed -i '' 's/"404-page"/"single-page-application"/' cloudflare.config.ts
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

## 部署（cf 形态）

部署一律走 `cf`（2026-10-20 拍板，仓库里不保留、也不新增其他部署工具链）：
`cloudflare.config.ts` 由 `cf deploy` 读取，纯静态资产站（没有 Worker 入口），
`dist/web` 作为 Workers Static Assets 上传，`notFoundHandling` 由模式决定（见上）。

```bash
npm run deploy:dry-run    # 先预览：构建 + 检查，不上传
npm run deploy            # cf deploy（自己跑完整构建链）
```

首次部署 checklist（create-site 生成时也会打印一份）：

1. **凭据**：`CLOUDFLARE_API_TOKEN` 放 GitHub Secrets（`cf auth login` 是交互式 OAuth，CI 跑不通）；
   本机 `export CLOUDFLARE_API_TOKEN=$(cat <token 文件路径>)`，只引用路径，不要把值写进任何地方。
2. **账号 ID**：生成时给了 `--account-id` 就已写进 `.github/workflows/ci.yml`；
   没给则在仓库变量里配 `vars.CLOUDFLARE_ACCOUNT_ID`。
3. **Worker 名**：`cloudflare.config.ts` 的 `worker.name`（create-site 按 `--name` 写入）。
4. **域名**：先改 `src/lib/site.ts` 的 `site.url`；自定义域 / route 是 playbook gate 3，先拍板再绑。
5. `npm run deploy:dry-run` → `npm run deploy` → `node scripts/verify-deploy.mjs <sha> --url <domain>/deploy-marker.txt`。
6. 有 secret 要配：`cf deploy --secrets-file <path>`（cf 暂不支持单条 secret 写入）。

CI 的 deploy job（main push 时）= 上面的 2/3/5 自动化：`cf deploy` → verify-deploy 校验 deploy-marker 的 sha。

`npm run preview` 对无尾斜杠路径会做 Vite 的 SPA 回退：在 prerender 模式下看静态页请用 `/privacy/`，线上由 Workers 的 `auto-trailing-slash` 处理两种写法。

上线判定：

```bash
curl https://<domain>/deploy-marker.txt
# __SITE_NAME__ deploy marker
# git_sha=<sha>
# released_at_utc=<iso>

node scripts/verify-deploy.mjs <sha> --url https://<domain>/deploy-marker.txt
```

## CI

`npm ci`（有 lockfile 时）→ `npm run build` → `npm run typecheck` → `npm test`。模板自带 `.github/workflows/ci.yml`，站点独立成仓库时它就是仓库的 CI。

## 多语言

模板只跑单语言（`site.lang = "en"`，`siteConfig.locale = "en_US"`）。要加语言时：路由树加 locale 分支，`PageDefinition` 增加 locale 维度，预渲染脚本改成 `locale × pages` 两层循环，sitemap 加 hreflang。不预置 i18n 框架：没有真实第二语言之前，任何 i18n 抽象都是猜的。

## 不要做的事

- **不要把 `single-page-application` 配到 prerender 站点**（软 404；`verify-render-mode` 会拦）。
- 不要在工具不可用时置 `live: true`（空壳页被索引是最贵的返工）。
- 不要引入 Tailwind / UI 框架（首屏要轻，样式就用 `globals.css`）。
- 不要改成运行时 SSR（标准是构建期预渲染；确需服务端渲染要先拍板）。
- 不要把 `deploy-marker.txt` 提交进 git（每次构建生成）。
- **不要手改 `src/shared/`**（要改回 microtools 改、打 tag、再 `sync-shared.mjs --to`；`npm test` 会守住边界）。
