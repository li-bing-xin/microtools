# shared 同步协议（复制 + 版本戳）

microtools 不发布包、不建 workspace、不用 submodule。共享代码以**源码副本**进入站点，靠 git tag 与
`VERSION` 对齐版本，靠一条命令升级。

```
microtools/shared/                站点/<repo>/
├── VERSION      ───复制───▶      src/shared/VERSION
├── README.md                      src/shared/README.md
├── seo/                           src/shared/seo/
├── render/                        src/shared/render/
└── scripts/                       src/shared/scripts/     （整棵一致）
                                   scripts/sync-shared.mjs （薄壳，稳定入口）
                                   .shared-upstream        （上游 git 地址）
```

## 为什么是复制

- 每个站点是独立仓库、独立构建、独立升级依赖；共享只共享「已验证的源码」，不共享发布流程。
- 复制进 `src/shared/` 的代码参与站点自己的 `tsc` / Vite / esbuild，类型检查覆盖到共享代码（包依赖做不到这点）。
- 代价是副本会落后 —— 由 `sync-shared.mjs --check` 显式暴露，而不是悄悄漂移。

## 站点里的三条命令

```bash
node scripts/sync-shared.mjs --check                  # 比对 VERSION 与上游最新 tag；落后 exit 1
node scripts/sync-shared.mjs --to 1.2.0               # 拉到 1.2.0：覆盖 src/shared/ + 改 VERSION
node scripts/sync-shared.mjs --to 1.2.0 --dry-run     # 只打印将变更的文件清单，不写盘
```

补充开关：

| 开关 | 作用 |
|---|---|
| `--upstream <git-url\|path>` | 覆盖上游地址（默认读站根 `.shared-upstream`，其次环境变量 `SHARED_UPSTREAM`） |
| `--skip-verify` | 跳过同步后的 build/test（仅离线 bootstrap 用，不推荐） |

退出码：`0` 成功/已最新/有意分叉；`1` `--check` 落后 或 `--to` 失败（已回滚）；`2` 用法或配置错误。

## `--to` 的行为（顺序固定）

1. `src/shared/DIVERGED.md` 存在 → 直接拒绝（exit 2），提示先人工归并。
2. 浅克隆上游 `v<version>` 到临时目录，读 `shared/VERSION` 校验：**tag 名必须与 VERSION 文件一致**，
   否则在动站点之前就失败（防止「忘记 bump 就 tag」的版本错位）。
3. 计算并打印人可读 diff：`+新增 / ~修改 / -删除` 的文件数与逐条清单（含大小变化）。
4. `--dry-run` → 到此为止，不写盘。
5. 备份 `src/shared` → 覆盖 → 写 `VERSION`。
6. 跑 `npm run build`；若 `package.json` 有 `test` 脚本，再跑 `npm test`。
   - 任一失败 → **自动回滚** `src/shared` 到同步前内容并 exit 1，打印失败输出尾部；
   - 全部通过 → 打印「请提交 src/shared/ 与 VERSION 的变更」。
7. 清理临时克隆（无论成败）。

> `npm test` 在站点里默认就是 `node scripts/verify-shared.mjs`：校验 VERSION 是 semver、切片入口齐全、
> `src/` 下没有 `@microtools/*` 导入 —— 也就是「共享只走复制」这条边界的自动守卫。

## 版本语义

- `shared/` 里**任何文件变更**都要 bump `VERSION` 并在同一 commit 打 tag `v<VERSION>`（annotated tag）。
- 只改文档可以不 bump，在 tag message 里注明。
- 站点 `VERSION` 只由 create-site / sync-shared 写入，不允许手改。
- 站点落后不阻止构建，但发版前应跑 `--check`（推荐放进站点 CI 的 `schedule` 或 PR 检查）。

## DIVERGED

`src/shared/DIVERGED.md` 存在 = **该站点有意不跟随上游**：

```md
# DIVERGED
本站在 1.0.0 基础上改了 face-detect 的置信度阈值（车牌场景需要更低阈值）。
归并计划：等 shared 支持 per-site 阈值配置后删除本文件（BING-xx）。
```

- `--check`：跳过比对，exit 0，打印一句说明；
- `--to`：拒绝，exit 2，不写盘、不回滚（什么都没动）。

`DIVERGED.md` 属于站点，不属于 shared；由于整棵覆盖会删掉它，所以同步器在覆盖前就拦住。

## 上游发版（microtools 侧）

```bash
# 1. 改 shared/，跑仓库自检
npm test                      # 编译切片 + 契约冒烟 + 生成器验收

# 2. bump 版本并打 tag（tag 名必须等于 VERSION）
printf '1.1.0\n' > shared/VERSION
git commit -am "feat(shared): ... (BING-xx)" && git tag -a v1.1.0 -m "shared 1.1.0: ..."
git push origin main --tags
```

站点侧从此 `--to 1.1.0` 可拉到。tag 是唯一的上游版本定位方式；不引入 registry、不引入 submodule。

## 常见问题

**同步时提示 `upstream tag vX declares shared/VERSION = Y`**
上游打 tag 时忘了改 `VERSION`。回 microtools 修好并重打 tag（`git tag -d` + 重新打），站点侧不会写盘。

**`--check` 一直失败但我不想升级**
说明真的落后了。要立刻止血就升；要长期不跟随就写 `DIVERGED.md` 并写明原因与归并计划。

**站点构建在同步后失败**
同步器已回滚。看它打印的失败输出尾部修站点侧（结构变更、依赖变更），或在 microtools 修 shared 再打新 tag。

**可以只同步一部分切片吗？**
不可以。`shared/` 是一个版本、一棵树；局部同步会让 `VERSION` 失去意义。
