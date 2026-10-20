# blurface（apps/blurface）

blurface.dev 的 TanStack Router + TanStack Query + React + Vite 版本，**预渲染模式**：15 条公开 URL 在构建期落盘成静态 HTML，部署到 Cloudflare Workers Static Assets。

迁移单：BING-39。旧 Next 版本仍在 `li-bing-xin/blurface` 仓库继续服务，切换前不删。

## 构建链（直接复用 `packages/site-template`，没有另写一套）

```
write-deploy-marker     # public/deploy-marker.txt（git sha + UTC）
vite build              # dist/web + 带 hash 的 assets
prerender-marketing     # esbuild SSR bundle -> 逐路由 renderToString -> <path>.html
write-static-seo-files  # sitemap.xml（15 loc）+ robots.txt
write-404-page          # 404.html（not_found_handling: "404-page" 要用）
verify-prerender-output # title/description/canonical/robots/JSON-LD/h1
verify-sitemap-coverage # sitemap <-> 产物双向
verify-render-mode      # 模式 <-> wrangler.jsonc <-> 产物（软 404 红线）
```

```bash
pnpm --filter blurface dev
pnpm --filter blurface build
pnpm --filter blurface typecheck
node scripts/verify-deploy.mjs <sha>            # 默认查 https://blurface.dev/deploy-marker.txt
```

## 与模板的三处故意不一致（都是线上形态要求，改动前先读这里）

1. **产物是扁平 `*.html`**（`privacy.html`，不是 `privacy/index.html`）。线上 Next export 就是扁平形态：`/privacy` 200 直出、`/privacy/` 307 回无斜杠。目录形态会让 `/privacy` 变成 307 → `/privacy/`，等于改了 URL 形态。`src/lib/pages.ts` 与 `scripts/lib/paths.mjs` 两处 `outputPathFor` 必须同步。
2. **多一步 `write-404-page.mjs`**。模板不产 `404.html`，而 `not_found_handling: "404-page"` 只会去找这个文件。
3. **`public/_headers` 是 blurface 线上那份**。CSP 里的 `wasm-unsafe-eval`、`worker-src blob:`、`media-src blob:` 是 ffmpeg.wasm / mediapipe / pdf.js 的运行时依赖，少一条工具就白屏；别照抄模板那份更严的 CSP。

## 并行部署（不切主域）

```bash
pnpm --filter blurface build
node scripts/preview-headers.mjs                 # 预览域加 X-Robots-Tag: noindex（只跑预览）
pnpm --filter blurface exec wrangler deploy --config wrangler.preview.jsonc
```

`wrangler.preview.jsonc` 起的是 `blurface-vite-preview`，同代码、同 R2 桶（`CORE_WASM → blurface-assets`）、同 `worker.js`；线上 `blurface` 不动。

对照：在 microtools 根目录跑

```bash
pnpm seo-parity https://blurface.dev https://blurface-vite-preview.<sub>.workers.dev --crawl
```

差异表为空（或每条都在 `--allow` 里写了理由）才算迁移完成。

## 还没搬完的部分

- 正文：工具页长文、对比表、use-case 长文、FAQ（连带 FAQPage 结构化数据）在 P1/P2。
- 编辑器：photo / license-plate / pixelate / PDF / video 五个编辑器与运行时同步脚本（mediapipe / ffmpeg / pdfjs / ort），在 P2。
- OG 图：8 张 1200×630 PNG 与 `worker.js` 的无扩展名 content-type 修正，在 P0b。
- `robots.txt` 的三组 AI crawler 白名单、`llms.txt`、全局 CSS 与 SiteNav/SiteFooter，在 P1。
