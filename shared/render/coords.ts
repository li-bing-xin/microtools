/** 引擎允许的最大长边，超过则降采样，防移动端内存溢出。 */
export const MAX_EDGE = 4096;

export function clampScale(w: number, h: number, maxEdge = MAX_EDGE): number {
  const m = Math.max(w, h);
  return m > maxEdge ? maxEdge / m : 1;
}
