import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng, deriveSeed, shuffled } from "../src/lib/rng.ts";

/**
 * 生成器约定的冒烟（printable-studio 回灌，BING-89 B2）：
 * 所有题面/布局生成共用这一份 PRNG——确定性是预渲染与 hydration 不闪的根。
 * 每个生成器再配自己的独立 verify*（校验逻辑不 import 生成逻辑），落不了格的
 * 输入走显式降级字段（unplaced / wordsShort），不许静默吞。
 */
describe("rng (shared PRNG)", () => {
  it("is deterministic for the same seed (prerender and hydration rely on this)", () => {
    const draw = (seed: number) => Array.from({ length: 16 }, () => createRng(seed)());
    assert.deepEqual(draw(20261024), draw(20261024));
    assert.notDeepEqual(draw(20261024), draw(20261025));
    for (const value of draw(1)) {
      assert.ok(value >= 0 && value < 1, `rng() must stay in [0, 1): got ${value}`);
    }
  });

  it("spreads salts apart so derived seeds do not correlate", () => {
    const derived = [0, 1, 2, 3, 7919].map((salt) => deriveSeed(20261024, salt));
    assert.equal(new Set(derived).size, derived.length, "adjacent salts must differ");
    const first = createRng(derived[0]!)();
    const second = createRng(derived[1]!)();
    assert.notEqual(first, second, "derived streams must be independent");
  });

  it("shuffles without mutating the input and keeps every element", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const copy = [...items];
    const result = shuffled(items, createRng(7));
    assert.deepEqual(items, copy, "shuffled must not mutate its input");
    assert.deepEqual([...result].sort(), [...copy].sort(), "shuffle must keep every element");
    assert.deepEqual(result, shuffled(items, createRng(7)), "same seed, same shuffle");
  });
});
