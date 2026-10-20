# ADR-0003：共享代码用「复制 + 版本戳」分发，不做包、不做 submodule

- **背景**：ADR-0001 的 pnpm monorepo 把站点和共享包绑在一个仓库里，但拓扑已经定为「每个站点一个独立仓库」（各自构建、各自部署、各自升级依赖）。跨仓消费只剩三条路：私有 npm registry、git submodule、复制。
- **选择**：**复制 + 版本戳**。microtools 只保留 `shared/`（唯一被复制走的东西）、`template/`、`bin/create-site.mjs`。站点把 `shared/` 整棵复制成 `src/shared/`，`VERSION` 记录来源 tag，`scripts/sync-shared.mjs` 一条命令跟进升级；`shared/` 有任何文件变更就 bump tag。否掉 registry（要维护发布与鉴权，站点还得配 `.npmrc`）与 submodule（克隆/CI 处处要 `--recursive`，且不能局部升级）。
- **代价**：站点里是源码副本，改共享代码要去 microtools 改、打 tag、再同步（这正是想要的：站内手改会产生漂移）。版本落后不会自动发现，靠 `sync-shared.mjs --check` 在站点 CI/发版前跑；有意分叉的站点用 `DIVERGED.md` 显式退出同步。回看时机：站点数 ≥5 或出现「同一段代码在 3 个站点各改过一版」时，再评估 registry。
