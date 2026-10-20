import type { LoadedImage, RedactBox } from "./types";

/**
 * MediaPipe Face Detector 适配层（仅需要自动检测的工具页启用）。
 *
 * 关键约定（完整契约见 ./README.md）：
 * - 模型与 WASM 全部自托管（默认 public/models），运行时零第三方请求；
 * - GPU delegate 失败自动回退 CPU；
 * - 任何失败（未注入 vision 模块/加载/推理/环境不支持）都返回 null——
 *   调用方必须保持手动打框完全可用。
 *
 * 这里**不**直接 `import("@mediapipe/tasks-vision")`：shared 会被复制进每个站点，
 * 没有自动检测需求的站点不该为了一个类型解析而安装这个依赖。需要自动检测的站点
 * 在自有代码里注入 vision 模块（三行，见 README「接入自动人脸检测」）。
 */

/** MediaPipe tasks-vision 的最小结构契约，避免把整个包变成 shared 的依赖。 */
export interface FaceVisionModule {
  FilesetResolver: {
    forVisionTasks(wasmDir: string): Promise<unknown>;
  };
  FaceDetector: {
    createFromOptions(
      fileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
        runningMode: "IMAGE";
        minDetectionConfidence: number;
      },
    ): Promise<unknown>;
  };
}

/** 注入方式：`configureFaceDetection({ loadVision: async () => await import("@mediapipe/tasks-vision") })` */
export type VisionLoader = () => Promise<FaceVisionModule>;

export interface FaceDetectConfig {
  /** 自托管模型路径（必须同源，守住「零第三方运行时请求」）。 */
  modelPath: string;
  /** 自托管 MediaPipe WASM 目录。 */
  wasmDir: string;
  /** 懒加载 tasks-vision；未注入时自动检测不可用（detectFaces 返回 null）。 */
  loadVision: VisionLoader | null;
}

const config: FaceDetectConfig = {
  modelPath: "/models/blaze_face_short_range.tflite",
  wasmDir: "/models/wasm",
  loadVision: null,
};
const MIN_CONFIDENCE = 0.5;
const FACE_DETECT_MAX_EDGE = 1600;
/** 人脸框向外扩 18%，避免只糊到五官中心 */
const PAD_RATIO = 0.18;

interface MpBoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}
interface MpDetection {
  boundingBox: MpBoundingBox;
  categories: Array<{ score: number }>;
}
interface Detector {
  detect(image: CanvasImageSource): MpDetection[];
}

let detectorPromise: Promise<Detector> | null = null;

/**
 * 覆盖模型/WASM 路径与 vision 加载器（站点静态资源目录不同、或启用自动检测时用）。
 * 需在首次 detectFaces 前调用；改动后旧 detector 会被丢弃，下次重新创建。
 */
export function configureFaceDetection(next: Partial<FaceDetectConfig>): void {
  Object.assign(config, next);
  detectorPromise = null; // 路径/加载器变了，旧 detector 必须重建
}

async function loadDetector(): Promise<Detector> {
  if (!config.loadVision) {
    throw new Error(
      "face detection is not configured: inject a loader with configureFaceDetection({ loadVision })",
    );
  }
  const vision = await config.loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(config.wasmDir);
  const make = (delegate: "GPU" | "CPU") =>
    vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: config.modelPath, delegate },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_CONFIDENCE,
    });
  try {
    return (await make("GPU")) as unknown as Detector;
  } catch {
    return (await make("CPU").catch((err: unknown) => {
      console.warn("[shared/render] face detection unavailable, manual-only mode:", err);
      throw err;
    })) as unknown as Detector;
  }
}

function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = loadDetector().catch((err) => {
      detectorPromise = null; // 允许下次重试
      throw err;
    });
  }
  return detectorPromise;
}

/**
 * 在降采样副本上检测，结果映射回自然坐标。
 * 返回的框可直接 setBoxes()；没有检测到人脸时返回空数组；失败返回 null。
 */
export async function detectFaces(image: LoadedImage): Promise<RedactBox[] | null> {
  try {
    const scale = Math.min(1, FACE_DETECT_MAX_EDGE / Math.max(image.width, image.height));
    let detectSource: CanvasImageSource & { width: number; height: number } = image.source;
    let inv = 1;
    if (scale < 1) {
      const c = document.createElement("canvas");
      c.width = Math.round(image.width * scale);
      c.height = Math.round(image.height * scale);
      const cc = c.getContext("2d");
      if (!cc) return null;
      cc.drawImage(image.source, 0, 0, c.width, c.height);
      detectSource = c;
      inv = 1 / scale;
    }

    const detector = await getDetector();
    // tasks-vision 0.10.x returns a FaceDetectorResult wrapper ({detections});
    // some versions/typings expose a bare array — accept both.
    const raw = detector.detect(detectSource) as unknown as MpDetection[] | { detections?: MpDetection[] };
    const detections = Array.isArray(raw) ? raw : (raw?.detections ?? []);

    const boxes: RedactBox[] = [];
    for (const d of detections) {
      const bb = d.boundingBox;
      const w = bb.width * (1 + PAD_RATIO * 2) * inv;
      const h = bb.height * (1 + PAD_RATIO * 2) * inv;
      const x = Math.max(0, (bb.originX - bb.width * PAD_RATIO) * inv);
      const y = Math.max(0, (bb.originY - bb.height * PAD_RATIO) * inv);
      boxes.push({
        id: `face_${boxes.length}`,
        shape: "rect",
        effect: "blur",
        strength: 55,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(Math.min(w, image.width - x)),
        h: Math.round(Math.min(h, image.height - y)),
      });
    }
    return boxes;
  } catch (err) {
    console.warn("[shared/render] face detection failed, manual boxes are unaffected:", err);
    return null;
  }
}
