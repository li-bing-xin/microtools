#!/usr/bin/env node
/**
 * 把 shared/ 的两个切片编译成可被 Node 直接 import 的 ESM，产物落 `.cache/shared/`。
 *
 * 为什么需要：切片是 TypeScript 源码（复制进站点后由站点自己的 Vite/tsc 编译），
 * 而契约冒烟（scripts/verify.mjs）要在本仓库里直接调用它们。没有 dist、没有 npm 包，
 * 所以这里用 esbuild 现场打两个 bundle，产物不入库。
 */
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, ".cache", "shared");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const entries = [
  { name: "seo", entry: "shared/seo/index.ts" },
  { name: "render", entry: "shared/render/index.ts" },
];

for (const { name, entry } of entries) {
  await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: path.join(outdir, `${name}.mjs`),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    // 切片必须零第三方依赖：打到 bundle 外就说明有人引入了包。
    external: ["@mediapipe/*"],
    logLevel: "warning",
  });
  console.log(`  built ${entry} -> ${path.relative(root, path.join(outdir, `${name}.mjs`))}`);
}
