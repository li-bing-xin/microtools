/**
 * 构建收尾：把 30.7 MiB 的 ffmpeg core wasm 从构建产物搬到 `.ffmpeg-core/`。
 *
 * Workers Static Assets 单文件上限 25 MiB（wrangler deploy/dev 实测硬拒绝），
 * 大文件留在产物里会让部署直接失败。搬出后由 worker.js 从 R2 回源
 * （wrangler.jsonc / cloudflare.config 的 CORE_WASM binding）。上传命令见站点 README。
 *
 * 搬出而不是不拷贝：Next 的 `next build` 会原样把 public/ 复制进 out/（本地 dev 也依赖
 * public/ffmpeg 里的完整文件），Vite 同理；所以统一在构建产物层面搬走。
 *
 * 产物目录：`--out <dir>` → `SITE_OUT_DIR` → 自动探测 out / dist/web / dist。
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { outFlag, resolveOutputDir } from "./lib/output-dir.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const outRoot = resolveOutputDir(siteRoot, outFlag());
const src = path.join(outRoot, "ffmpeg", "core", "ffmpeg-core.wasm");
const destDir = path.join(siteRoot, ".ffmpeg-core");
const dest = path.join(destDir, "ffmpeg-core.wasm");

if (!existsSync(src)) {
  console.error(
    `[relocate-ffmpeg-core] missing ${path.relative(siteRoot, src)} — run the site build first (or pass --out <dir>)`,
  );
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
rmSync(src);
console.log(
  `[relocate-ffmpeg-core] ${path.relative(siteRoot, src)} -> ${path.relative(siteRoot, dest)} (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MiB; excluded from assets, served from R2)`,
);
