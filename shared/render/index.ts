/**
 * render 切片：框架无关的浏览器端打码编辑器内核。
 *
 * 用法（React 薄壳由站点自己写，只做指针换算 / 工具条 / 调 engine）：
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
} from "./types";
export { MAX_EDGE, clampScale } from "./coords";
export { supportsCtxFilter, applyBox, renderComposition } from "./effects";
export { EditorEngine, newId } from "./engine";
export { detectFaces, configureFaceDetection } from "./face-detect";
export type { FaceDetectConfig, FaceVisionModule, VisionLoader } from "./face-detect";
