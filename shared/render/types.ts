export type EffectKind = "blur" | "pixelate";
export type ShapeKind = "rect" | "ellipse";
export type ExportFormat = "image/png" | "image/jpeg";

/** 打码框。坐标一律为自然坐标（引擎载图后的 canvas 像素），左上原点。 */
export interface RedactBox {
  id: string;
  shape: ShapeKind;
  effect: EffectKind;
  /** 0..100，映射关系见 effects.ts */
  strength: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LoadedImage {
  /** ImageBitmap 或降采样后的 canvas，二者都有 width/height */
  source: CanvasImageSource & { width: number; height: number };
  width: number;
  height: number;
  name: string;
  type: string;
}
