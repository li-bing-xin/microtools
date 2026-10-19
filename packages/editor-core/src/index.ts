/**
 * editor-core：框架无关的浏览器端打码编辑器内核。
 *
 * 用法（React 薄壳示例见 apps 内的工具页）：
 * ```ts
 * const engine = new EditorEngine(canvasEl);
 * const img = await engine.loadBlob(file);
 * const faces = await detectFaces(img); // null = 检测不可用，手动打框照常
 * engine.setBoxes(faces ?? []);
 * const blob = await engine.exportBlob("image/jpeg", 0.9);
 * ```
 */
export type {
  EffectKind,
  ShapeKind,
  ExportFormat,
  RedactBox,
  LoadedImage,
} from "./types.js";
export { MAX_EDGE, clampScale } from "./coords.js";
export { supportsCtxFilter, applyBox, renderComposition } from "./effects.js";
export { EditorEngine, newId } from "./engine.js";
export { detectFaces, configureFaceDetection } from "./face-detect.js";
