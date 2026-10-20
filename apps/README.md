# apps/

每个站点一个目录，独立构建、独立部署。

## 现状

- `apps/spa-demo`：`--mode spa` 生成的示例站（客户端路由、无 sitemap/预渲染产物、`single-page-application` 回退）。
- `apps/seo-demo`：`--mode prerender` 生成的示例站（显式清单预渲染 + sitemap 覆盖率校验 + `404-page`）。
- 两个示例都用于 CI 验证模板的两种构建链，可留可删（删掉后重跑对应命令即可复现）。
- blurface.dev 仍由 `li-bing-xin/blurface` 部署（生产切换要过 gate 3，不在初始化范围）。

## 新站怎么进来

```bash
pnpm new-site <app-name> --mode spa|prerender --domain https://<domain> --name "<Brand>"
pnpm install
pnpm --filter <app-name> dev
pnpm --filter <app-name> build   # SPA：build + 模式校验；prerender：+ 预渲染 + sitemap 校验
```

## 规则

- 一个 app = 一个域名 = 一个 Multica project。
- app 之间不共享状态、不互链成 network；共享只走 `packages/*`。
- 站点特有逻辑留在 app 内；出现第二个真实使用者才抽包（见 `docs/adr/0001`）。
- 任何 app 的生产部署与域名绑定都要 gate 3 批准；preview 自主。
