# @microtools/editor-core

浏览器端打码编辑器的框架无关内核（纯 TS，无 React 依赖）。从 blurface P1 线上验证实现原样抽包，`EditorEngine` / `detectFaces` / `renderComposition` 的接口与 blurface `lib/editor/` 保持一致。

## 能力

| 模块 | 职责 |
|---|---|
| `engine.ts` | `EditorEngine`：载图（>4096px 长边降采样）、boxes 状态、rAF 预览、导出（与预览同一条合成路径） |
| `effects.ts` | blur / pixelate 渲染；`ctx.filter` 特性检测 + 降采样回退（Safari 兼容） |
| `coords.ts` | 大图降采样保护 |
| `face-detect.ts` | MediaPipe Face Detection 适配：模型自托管、GPU→CPU 回退、失败返回 `null`（手动模式不被拖死） |
| `types.ts` | `RedactBox` / `LoadedImage` / `ExportFormat` |

## 使用

```ts
import { EditorEngine, detectFaces, configureFaceDetection } from "@microtools/editor-core";

const engine = new EditorEngine(canvas);
const img = await engine.loadBlob(file);
configureFaceDetection({ modelPath: "/models/blaze_face_short_range.tflite" }); // 可选，默认同此
const faces = await detectFaces(img); // null = 检测不可用；[] = 没检测到
engine.setBoxes(faces ?? []);
const blob = await engine.exportBlob("image/jpeg", 0.9); // EXIF 天然剥离
```

React 薄壳只做三件事：`getBoundingClientRect` 比例换算指针坐标、渲染工具条、把状态变化转成 engine 调用。核心状态一律留在 engine 内，不要在 React state 里再存一份 boxes（双真源会漂移）。

## 自托管模型清单（守住「零第三方运行时请求」）

- 模型：`blaze_face_short_range.tflite` → `public/models/`
- WASM：`node_modules/@mediapipe/tasks-vision/wasm/*` → `public/models/wasm/`
- 模型与 WASM 必须 lazy load，不参与首屏 LCP。

## 接口纪律

- 本包是共享层，改接口 = 破坏 3 个已上线使用方（blurface 的照片打码、车牌、像素化页）。破坏性变更必须先在 issue 列全部使用方影响。
- 站点特有行为用配置/组合实现，不往包里塞业务分支。
