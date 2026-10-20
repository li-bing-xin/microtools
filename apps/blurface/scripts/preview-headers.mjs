#!/usr/bin/env node
/**
 * 预览部署专用：给 `dist/web/_headers` 追加一条 `X-Robots-Tag: noindex`。
 *
 * 只在 `wrangler.preview.jsonc` 的部署流程里跑，不进 `build` 链——
 * 线上一旦带上这条，整站从索引里消失，这不是能靠"记得别跑"来保证的事，
 * 所以它必须是独立命令，而不是构建的一个开关。
 *
 *   pnpm --filter blurface build
 *   node scripts/preview-headers.mjs
 *   pnpm dlx wrangler@^4 deploy --config wrangler.preview.jsonc
 */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { distDir, displayPath } from "./lib/paths.mjs";

const file = join(distDir, "_headers");
const current = await readFile(file, "utf8");

if (current.includes("X-Robots-Tag")) {
  console.log(`  ${displayPath(file)} 已经带 X-Robots-Tag，跳过`);
  process.exit(0);
}

await appendFile(
  file,
  [
    "",
    "# 预览域专用（preview-headers.mjs 追加）：workers.dev 子域不该被当成重复内容收录。",
    "/*",
    "  X-Robots-Tag: noindex, nofollow",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`  ${displayPath(file)}: appended X-Robots-Tag: noindex（仅预览）`);
