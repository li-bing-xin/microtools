/**
 * 确定性随机：所有生成器共用一份 PRNG 与派生规则。
 *
 * - `createRng` 是 mulberry32：小、快、确定性，同一个 seed 永远得到同一串随机数
 *   （预渲染与 hydration 都靠这一点）。
 * - `deriveSeed` 把「主 seed + 一个盐」混成新的 seed：bingo 的第 i 张卡、call sheet
 *   等各自派生，互不影响，也不必把每张卡的 seed 存进数据结构（需要时可单独重算）。
 * - `shuffled` 是 Fisher–Yates：从后往前换，每个排列等概率，且只用 rng、无全局随机。
 */

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 主 seed + 盐 → 新 seed。盐用乘法散列摊开，相邻盐的派生值不相关。 */
export function deriveSeed(seed: number, salt: number): number {
  let state = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x85ebca6b) >>> 0;
  state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35) >>> 0;
  return (state ^ (state >>> 16)) >>> 0;
}

/** 就地 Fisher–Yates 的复制版：不改入参，返回洗好的新数组。 */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const a = result[index]!;
    const b = result[swap]!;
    result[index] = b;
    result[swap] = a;
  }
  return result;
}
