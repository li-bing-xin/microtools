# shared/ — 可复制的共享切片

这个目录是 microtools **唯一被复制走的东西**。没有任何 `@microtools/*` 包、没有 workspace 软链：
站点把整个 `shared/` 复制成自己的 `src/shared/`，用 `VERSION` 记录来源版本，用一条命令跟进升级。

```
shared/
├── VERSION                 当前版本（= 上游 git tag v<VERSION>）
├── README.md               本文件：切片目录、依赖、使用方
├── seo/                    meta / JSON-LD / sitemap / robots
├── render/                 打码引擎内核（effects / coords / engine / face-detect 契约）
└── scripts/                资源同步 + 构建收尾 + 同步器
```

## 切片目录

| 切片 | 内容 | 运行时/构建依赖 | 使用方 |
|---|---|---|---|
| `seo/` | `buildPageMetadata`、`faqPageJsonLd`、`webApplicationJsonLd`、`jsonLdGraph`、`buildSitemap` / `renderSitemapXml`、`buildRobots` / `renderRobotsTxt` | 无（纯 TS，零依赖） | template、blurface、所有需要收录的站点 |
| `render/` | `EditorEngine`（载图降采样 / rAF 预览 / 导出）、`applyBox` / `renderComposition`（blur / pixelate + Safari `ctx.filter` 降级）、`MAX_EDGE = 4096`、`detectFaces` 适配层与契约 | `seo/` 无依赖；`render/` 本体零依赖，自动人脸检测需站点自行注入 `@mediapipe/tasks-vision` | blurface 照片/车牌/像素化页、照片/视频类站点 |
| `scripts/sync-shared.mjs` | 版本比对与升级（`--check` / `--to` / `--dry-run`），同步后自动 build+test，失败回滚 | node ≥22、git | 每个站点（生成时复制到 `scripts/sync-shared.mjs` 薄壳） |
| `scripts/sync-mediapipe-wasm.mjs` | `@mediapipe/tasks-vision` 的 wasm → `public/models/wasm/` | 装了该包才跑 | 用自动人脸检测的站点 |
| `scripts/sync-ffmpeg-assets.mjs` | `@ffmpeg/{ffmpeg,core}` → `public/ffmpeg/`（UMD wrapper + ESM worker + core） | 装了 ffmpeg.wasm 才跑 | 视频类站点 |
| `scripts/sync-pdfjs-assets.mjs` | `pdfjs-dist` worker + standard_fonts + cmaps → `public/pdfjs/` | 装了 pdfjs-dist 才跑 | PDF 类站点 |
| `scripts/sync-ort-wasm.mjs` | `onnxruntime-web` CPU wasm → `public/models/ort/`（10 MB 单文件预算校验） | 装了 onnxruntime-web 才跑 | 车牌/目标检测类站点 |
| `scripts/relocate-ffmpeg-core.mjs` | 把 30.7 MiB core wasm 搬出产物到 `.ffmpeg-core/`（Workers 单文件 25 MiB 上限） | 构建产物存在 | 视频类站点 |
| `scripts/compress-ort-wasm.mjs` | 产物里的 ORT wasm 压成 `.gz`（Static Assets 不自动压缩） | 构建产物存在 | 车牌类站点 |
| `scripts/write-deploy-marker.mjs` | 写 `public/deploy-marker.txt`（站点名 + git sha），判定「合并 ≠ 上线」 | git | 所有站点 |

`scripts/lib/` 是这些脚本的共用小工具（包目录解析、站点根定位、产物目录探测），不单独发布。

## 什么进 shared，什么不进

**进**（易做错、必须全站一致）：sitemap/`live` 标志、JSON-LD 结构、canonical/title 规则、`ctx.filter`
降级与 `MAX_EDGE`、模型/WASM 自托管路径与 GPU→CPU 回退契约、部署标记。

**不进**（产品差异大，分叉是对的）：编辑器 UI 组件（PDF 涂黑 / 照片 / 视频逐帧）、PII 规则引擎与
扫描器、页面组件、内容页数据、任何需要站点业务分支的东西。

判断句式：**「第二个站点也要这段代码，而且写错会出事故」→ 进 shared；「只是长得像」→ 留在站点。**

## 版本与同步

- `shared/` 里任何文件变更 → 必须 bump `VERSION` 并在同一 commit 打 tag `v<VERSION>`；只改文档可不 bump（在 tag message 里注明）。
- 站点升级：`node scripts/sync-shared.mjs --check` → `--to <version>`；`DIVERGED.md` 存在则跳过/拒绝。
- 站内**不得**手改 `src/shared/`：要改回 microtools 改、打新 tag、再同步。

完整协议（含 `--dry-run`、失败回滚、DIVERGED 语义）见 [`../docs/shared-protocol.md`](../docs/shared-protocol.md)。
