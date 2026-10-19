# apps/

每个站点一个目录，独立构建、独立部署。

## 现状

v1 还没有 app 迁入：blurface.dev 仍由 `li-bing-xin/blurface` 部署（生产切换要过 gate 3，不在初始化范围）。本目录先留空，只放规则。

## 新站怎么进来

```bash
pnpm new-site <app-name> --domain https://<domain> --name "<Brand>"
pnpm install
pnpm --filter <app-name> dev
```

## 规则

- 一个 app = 一个域名 = 一个 Multica project。
- app 之间不共享状态、不互链成 network；共享只走 `packages/*`。
- 站点特有逻辑留在 app 内；出现第二个真实使用者才抽包（见 `docs/adr/0001`）。
- 任何 app 的生产部署与域名绑定都要 gate 3 批准；preview 自主。
