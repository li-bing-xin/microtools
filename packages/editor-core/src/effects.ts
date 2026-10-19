import type { RedactBox } from "./types.js";

type Ctx = CanvasRenderingContext2D;

let filterSupport: boolean | null = null;

/** Safari 旧版 ctx.filter 缺口：运行时特性检测，而非 UA 嗅探。 */
export function supportsCtxFilter(): boolean {
  if (filterSupport === null) {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) {
      filterSupport = false;
    } else {
      c.filter = "blur(2px)";
      filterSupport = c.filter !== "none" && c.filter !== "";
    }
  }
  return filterSupport;
}

function pathShape(ctx: Ctx, b: RedactBox): void {
  ctx.beginPath();
  if (b.shape === "ellipse") {
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(b.x, b.y, b.w, b.h);
  }
}

function blurRadius(b: RedactBox): number {
  const short = Math.min(Math.max(b.w, 1), Math.max(b.h, 1));
  return Math.max(3, short * (0.03 + (b.strength / 100) * 0.22));
}

function pixelBlockSize(b: RedactBox): number {
  return Math.max(3, 3 + (b.strength / 100) * 40);
}

function applyBlurWithFilter(ctx: Ctx, img: CanvasImageSource, b: RedactBox): void {
  const r = blurRadius(b);
  const pad = Math.ceil(r * 3);
  const size = img as { width: number; height: number };
  const sx = Math.max(0, b.x - pad);
  const sy = Math.max(0, b.y - pad);
  const sw = Math.min(size.width - sx, b.w + pad * 2);
  const sh = Math.min(size.height - sy, b.h + pad * 2);
  ctx.save();
  pathShape(ctx, b);
  ctx.clip();
  ctx.filter = `blur(${r.toFixed(1)}px)`;
  // 只重绘框周边区域（pad ≥ 3×radius），避免整图重绘的性能开销
  ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}

/** ctx.filter 不可用时的回退：降采样-放大两遍，视觉略软但无兼容性问题。 */
function applyBlurFallback(ctx: Ctx, img: CanvasImageSource, b: RedactBox): void {
  const k = Math.max(2, Math.round(2 + (b.strength / 100) * 24));
  const w = Math.max(1, Math.round(b.w / k));
  const h = Math.max(1, Math.round(b.h / k));
  const t = document.createElement("canvas");
  t.width = w;
  t.height = h;
  const tc = t.getContext("2d");
  if (!tc) return;
  tc.imageSmoothingEnabled = true;
  tc.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, w, h);
  ctx.save();
  pathShape(ctx, b);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(t, 0, 0, w, h, b.x, b.y, b.w, b.h);
  ctx.drawImage(t, 0, 0, w, h, b.x, b.y, b.w, b.h);
  ctx.restore();
}

function applyPixelate(ctx: Ctx, img: CanvasImageSource, b: RedactBox): void {
  const block = pixelBlockSize(b);
  const w = Math.max(1, Math.round(b.w / block));
  const h = Math.max(1, Math.round(b.h / block));
  const t = document.createElement("canvas");
  t.width = w;
  t.height = h;
  const tc = t.getContext("2d");
  if (!tc) return;
  tc.imageSmoothingEnabled = true;
  tc.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, w, h);
  ctx.save();
  pathShape(ctx, b);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t, 0, 0, w, h, b.x, b.y, b.w, b.h);
  ctx.restore();
}

export function applyBox(
  ctx: Ctx,
  img: CanvasImageSource,
  b: RedactBox,
  allowFilter: boolean = supportsCtxFilter(),
): void {
  if (b.w <= 0 || b.h <= 0) return;
  if (b.effect === "pixelate") {
    applyPixelate(ctx, img, b);
  } else if (allowFilter) {
    applyBlurWithFilter(ctx, img, b);
  } else {
    applyBlurFallback(ctx, img, b);
  }
}

/** 完整合成：原图 + 全部打码框（自然坐标）。预览与导出共用，保证所见即所得。 */
export function renderComposition(ctx: Ctx, img: CanvasImageSource, boxes: RedactBox[]): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(img, 0, 0);
  for (const b of boxes) applyBox(ctx, img, b);
}
