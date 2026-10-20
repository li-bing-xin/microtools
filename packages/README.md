# packages/ 已删除

共享代码不再以包的形式发布，改为**复制 + 版本戳**：

| 原来 | 现在 |
|---|---|
| `packages/seo-kit` | [`shared/seo`](../shared/seo) |
| `packages/editor-core` | [`shared/render`](../shared/render) |
| `packages/site-template` | [`template/`](../template) + [`bin/create-site.mjs`](../bin/create-site.mjs) |

站点用 `node scripts/sync-shared.mjs --to <version>` 跟进版本；没有 `@microtools/*` 依赖、
没有 workspace 软链、没有私有 registry。协议见 [`docs/shared-protocol.md`](../docs/shared-protocol.md)，
决策见 [`docs/adr/0003-shared-by-copy.md`](../docs/adr/0003-shared-by-copy.md)。

git 历史里的 `packages/` 记录保留（不重写历史），只删了当前树。
