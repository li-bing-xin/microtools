import type { ExportFormat, LoadedImage, RedactBox } from "./types.js";
import { renderComposition } from "./effects.js";
import { clampScale } from "./coords.js";

let seq = 0;
export function newId(prefix = "box"): string {
  return `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

function decodeViaImgElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported or corrupt image"));
    };
    img.src = url;
  });
}

function toBlobPromised(c: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), format, quality),
  );
}

function stripExt(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 60) || "image"
  );
}

/**
 * 框架无关的编辑器核心。
 * - boxes 存自然坐标（canvas 像素），单一真源；
 * - 预览与导出走同一条 renderComposition 路径；
 * - 导出经全新 canvas 重编码，EXIF 天然剥离。
 */
export class EditorEngine {
  private image: LoadedImage | null = null;
  private boxes: RedactBox[] = [];
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  get loaded(): LoadedImage | null {
    return this.image;
  }

  get currentBoxes(): readonly RedactBox[] {
    return this.boxes;
  }

  async loadBlob(blob: Blob): Promise<LoadedImage> {
    let bitmap: ImageBitmap | HTMLImageElement;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      bitmap = await decodeViaImgElement(blob);
    }
    const scale = clampScale(bitmap.width, bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    let source: CanvasImageSource & { width: number; height: number } = bitmap;
    if (scale < 1) {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const cc = c.getContext("2d");
      if (!cc) throw new Error("Canvas 2D unavailable");
      cc.imageSmoothingQuality = "high";
      cc.drawImage(bitmap, 0, 0, width, height);
      if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
      source = c;
    }

    this.image = { source, width, height, name: (blob as File).name || "image", type: blob.type || "image/jpeg" };
    this.boxes = [];
    this.canvas.width = width;
    this.canvas.height = height;
    this.requestRender();
    return this.image;
  }

  setBoxes(boxes: RedactBox[]): void {
    this.boxes = boxes;
    this.requestRender();
  }

  addBox(b: Omit<RedactBox, "id">): RedactBox {
    const box = { ...b, id: newId() };
    this.boxes = [...this.boxes, box];
    this.requestRender();
    return box;
  }

  updateBox(id: string, patch: Partial<Omit<RedactBox, "id">>): void {
    this.boxes = this.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b));
    this.requestRender();
  }

  removeBox(id: string): void {
    this.boxes = this.boxes.filter((b) => b.id !== id);
    this.requestRender();
  }

  clearBoxes(): void {
    this.boxes = [];
    this.requestRender();
  }

  /** 命中测试（从最上层往下），供 UI 层选中/拖动用。 */
  hitTest(x: number, y: number): RedactBox | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  requestRender(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.renderPreview());
  }

  private renderPreview(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !this.image) return;
    renderComposition(ctx, this.image.source, this.boxes);
  }

  /** 导出：离屏 canvas 按自然尺寸合成，与预览同路径。 */
  async exportBlob(format: ExportFormat = "image/jpeg", quality = 0.9): Promise<Blob> {
    if (!this.image) throw new Error("No image loaded");
    const c = document.createElement("canvas");
    c.width = this.image.width;
    c.height = this.image.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    renderComposition(ctx, this.image.source, this.boxes);
    return toBlobPromised(c, format, quality);
  }

  suggestedExportName(format: ExportFormat): string {
    const base = stripExt(this.image?.name ?? "image");
    return `redacted-${base}.${format === "image/png" ? "png" : "jpg"}`;
  }
}
