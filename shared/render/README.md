# shared/render

浏览器端打码编辑器的框架无关内核（纯 TS，无 React 依赖）。从 blurface P1 线上验证实现抽出，随 `shared/` 复制进站点 `src/shared/render/`。

**这是复制切片，不是 npm 包**：站点里 `import { EditorEngine } from "@/shared/render";`，没有 `@microtools/*` 依赖。站内不得手改本目录，要改回 microtools 改、打新 tag、再 `node scripts/sync-shared.mjs --to <version>`。

## 能力

| 模块 | 职责 |
|---|---|
| `engine.ts` | `EditorEngine`：载图（>4096px 长边降采样）、boxes 状态、rAF 预览、导出（与预览同一条合成路径） |
| `effects.ts` | blur / pixelate 渲染；`ctx.filter` 特性检测 + 降采样回退（Safari 兼容） |
| `coords.ts` | 大图降采样保护（`MAX_EDGE = 4096`） |
| `face-detect.ts` | MediaPipe Face Detection 适配：模型自托管、GPU→CPU 回退、失败返回 `null`（手动模式不被拖死） |
| `types.ts` | `RedactBox` / `LoadedImage` / `ExportFormat` |

## 使用

```ts
import { EditorEngine, detectFaces } from "@/shared/render";

const engine = new EditorEngine(canvas);
const img = await engine.loadBlob(file);
const faces = await detectFaces(img); // null = 检测不可用；[] = 没检测到
engine.setBoxes(faces ?? []);
const blob = await engine.exportBlob("image/jpeg", 0.9); // EXIF 天然剥离
```

React 薄壳只做三件事：`getBoundingClientRect` 比例换算指针坐标、渲染工具条、把状态变化转成 engine 调用。核心状态一律留在 engine 内，不要在 React state 里再存一份 boxes（双真源会漂移）。

## 接入自动人脸检测（可选，默认关闭）

`face-detect.ts` 不直接 `import("@mediapipe/tasks-vision")`：shared 会复制进每个站点，没有自动检测需求的站点不该为它背一个依赖。要启用，在站点自有代码里注入加载器（三行）：

```ts
// src/lib/face.ts —— 站点自有文件，不碰 src/shared/
import { configureFaceDetection } from "@/shared/render";
import * as vision from "@mediapipe/tasks-vision";

configureFaceDetection({ loadVision: async () => vision });
```

未注入时 `detectFaces()` 返回 `null`，手动打框完全可用 —— 这是刻意的降级契约，不是错误。

## 契约（改动前先读）

- **零第三方运行时请求**：模型与 WASM 必须同源自托管。
  - 模型：`blaze_face_short_range.tflite` → `public/models/`
  - WASM：`node_modules/@mediapipe/tasks-vision/wasm/*` → `public/models/wasm/`（`shared/scripts/sync-mediapipe-wasm.mjs`）
- **GPU → CPU 回退**：GPU delegate 创建失败自动退 CPU；两者都失败则整条链路返回 `null`，绝不抛到 UI。
- **失败返回 `null`，不抛错**：调用方 `setBoxes(faces ?? [])` 即可，手动模式不被拖死。
- **模型与 WASM 必须 lazy load**，不参与首屏 LCP；检测在降采样副本上做（长边 1600），结果映射回自然坐标。
- **预览与导出同一条 `renderComposition` 路径**：不允许 UI 层自己再画一遍。

## 接口纪律

- 本切片被 blurface 的照片打码/车牌/像素化页使用；改接口 = 破坏使用方。破坏性变更必须先在 issue 里列全部使用方影响，并随 tag 升版本。
- 站点特有行为用配置/组合实现，不往切片里塞业务分支。
