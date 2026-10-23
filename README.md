# microtools

「微工具工厂」的**模板 + 共享切片**仓库：单用途在线工具站的脚手架、可复制的共享代码与作业手册。

不是 monorepo，也不发布 npm 包：每个站点是独立仓库，从 `template/` 生成，把 `shared/` 复制进自己的
`src/shared/`，用 `VERSION` + git tag 跟进升级（决策见 [ADR-0003](docs/adr/0003-shared-by-copy.md)）。

## 结构

```
shared/                  # 唯一被复制走的东西（VERSION + seo/ + render/ + scripts/）
  seo/                   # meta / JSON-LD / sitemap / robots（含 live 单一标志）
  render/                # 打码引擎内核：effects（Safari 降级）/ coords（MAX_EDGE）/ engine / face-detect 契约
  scripts/               # 资源同步、ffmpeg core 搬 R2、ORT 压缩、deploy-marker、sync-shared
template/                # 生成器骨架：Vite + TanStack Router/Query + 预渲染 + sitemap 校验 + CI
                         # 部署形态 = cf（cloudflare.config.ts + cf deploy + CI deploy job），
                         # 不带任何 wrangler 配置（2026-10-20 拍板；BING-89 B1）
                         # 内置可关的打印层 / link-graph / rng 生成器约定 / print-fit harness（B2）
bin/create-site.mjs      # 生成站点：复制 template/ + 整棵 shared/ -> src/shared/
packages/README.md       # 旧 packages/ 的指针（目录已删）
docs/
  playbook.md            # 调研 → 立项 → 开发 → 验收 → 运营
  shared-protocol.md     # 复制 + 版本戳 + sync-shared.mjs 的完整协议
  adr/                   # 架构决策（0003 说明为什么用复制而不是包）
scripts/
  build-shared.mjs       # 把 shared/ 切片编译成 ESM（供契约冒烟）
  verify.mjs             # 切片契约冒烟（seo 规则 / 降采样阈值 / 零第三方依赖）
  verify-create-site.mjs # 生成器验收（src/shared 与 shared/ 逐字节一致）
  acceptance.sh          # 工厂验收套件（冻结的验证器，勿改）
```

## 常用命令

```bash
pnpm install                                     # 仅 esbuild + typescript
pnpm test                                        # 切片编译 + 契约冒烟 + 生成器验收
pnpm typecheck                                   # shared/ 切片的 tsc

node bin/create-site.mjs pixelate --mode prerender --domain https://pixelate.app --name "Pixelate"
# 默认生成到同级目录 ../pixelate（每个站点一个独立仓库）

# 站点里（生成物自带）
npm install && npm test && npm run build
node scripts/sync-shared.mjs --check             # 上游是否有新 shared
node scripts/sync-shared.mjs --to 1.1.0          # 升级（自动 build+test，失败回滚）
```

## 边界

- **共享只走复制**：站点里是 `src/shared/` 源码；没有 `@microtools/*`、workspace 软链、私有 registry、submodule。
- **什么进 shared**：易做错、必须全站一致的东西（sitemap/`live`、canonical/title、JSON-LD、`ctx.filter` 降级、
  `MAX_EDGE`、模型自托管与 GPU→CPU 回退契约、部署标记）。
- **什么不进**：编辑器 UI、PII 规则引擎与扫描器、页面组件、内容页数据。判断句式：「第二个站点也要，且写错会出事故」才进。
- 纯前端：工具在浏览器内处理文件，不上传、不落库。
- 生产部署、域名绑定、变现开关、kill/scale 由成员拍板；preview 与代码交付自主。
