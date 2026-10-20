# microtools

「微工具工厂」的 monorepo：单用途在线工具站的共享代码与作业手册。

- 作业手册：[`docs/playbook.md`](docs/playbook.md)
- 架构决策：[`docs/adr/`](docs/adr)
- 站点目录：[`apps/`](apps)（规则见其 README）

## 结构

```
apps/                 # 每个站点一个目录（当前有 spa-demo / seo-demo 示例，规则见 apps/README.md）
packages/
  editor-core/        # 浏览器端打码引擎（blur / pixelate / 人脸检测 / 无 EXIF 导出）
  seo-kit/            # meta / JSON-LD / sitemap / robots 单一真源
  site-template/      # TanStack Router + Vite 双模式脚手架（SPA 默认 / 预渲染可选）+ pnpm new-site
docs/
  playbook.md         # 调研 → 立项 → 开发 → 验收 → 运营 的标准作业程序
  adr/                # 跨项目架构决策（ADR-lite）
scripts/verify.mjs    # 共享包契约冒烟校验
```

## 常用命令

```bash
pnpm install            # 安装 workspace 依赖
pnpm typecheck          # 所有包 tsc --noEmit
pnpm build              # 所有包编译到 dist/
pnpm verify             # build + 契约冒烟校验
pnpm new-site <name> --mode spa|prerender --domain https://<domain> --name "<Brand>"
pnpm --filter <name> build   # 按模式：SPA 只 build；prerender 加预渲染 + sitemap 校验
```

## 边界

- 纯前端：所有工具在浏览器内处理文件，不上传、不落库。
- 共享层准入：≥2 个真实使用方或成员已批准的计划；站点差异走配置，不在包里写分支。
- 生产部署、域名绑定、变现开关、kill/scale 由成员拍板；preview 与代码交付自主。
