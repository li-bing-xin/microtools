/**
 * 构建步骤：gzip ONNX Runtime 的 wasm，让首次懒加载落在 Workers Static Assets 的
 * 10 MB 预算内（Static Assets 默认不对静态响应做压缩）。
 *
 * - `<产物>/models/ort/ort-wasm.wasm`（9.3 MiB）替换成 `ort-wasm.wasm.gz`（约 2.5 MiB）；
 * - worker.js 用 `.gz` 资产回答 `/models/ort/ort-wasm.wasm` 并带上 `Content-Encoding: gzip`，
 *   浏览器/ORT 仍看到普通的 wasm URL；
 * - `public/models/ort/ort-wasm.wasm` 原样保留给本地 dev（那里没有 Worker 在前面）。
 *
 * 可重复执行：原始文件不存在（已压缩过）时是无操作。
 * 产物目录：`--out <dir>` → `SITE_OUT_DIR` → 自动探测 out / dist/web / dist。
 */
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { outFlag, resolveOutputDir } from "./lib/output-dir.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const outRoot = resolveOutputDir(siteRoot, outFlag());
const raw = path.join(outRoot, "models", "ort", "ort-wasm.wasm");
const gz = `${raw}.gz`;

if (!existsSync(raw)) {
  if (existsSync(gz)) {
    console.log(`[compress-ort-wasm] already compressed (${(statSync(gz).size / 1024 / 1024).toFixed(2)} MiB)`);
  } else {
    console.error(
      `[compress-ort-wasm] missing ${path.relative(siteRoot, raw)} — run the site build first (or pass --out <dir>)`,
    );
    process.exit(1);
  }
} else {
  const body = readFileSync(raw);
  const compressed = gzipSync(body, { level: 9 });
  writeFileSync(gz, compressed);
  rmSync(raw);
  console.log(
    `[compress-ort-wasm] ${(body.length / 1024 / 1024).toFixed(2)} MiB -> ${(compressed.length / 1024 / 1024).toFixed(2)} MiB (gzip; served via worker.js)`,
  );
}
