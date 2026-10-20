/**
 * 把 ffmpeg.wasm 运行时复制进 `public/ffmpeg`，浏览器只从本站源取它：
 * 视频工具因此没有 unpkg/jsdelivr 运行时请求，「文件不离开浏览器」的承诺才成立。
 *
 * 布局：
 *   public/ffmpeg/ffmpeg.js               UMD wrapper（暴露 window.FFmpegWASM）
 *   public/ffmpeg/worker/{worker,const,errors}.js   ESM worker 及其 import
 *   public/ffmpeg/core/ffmpeg-core.js     ESM core 工厂（worker 真正 import 的文件）
 *   public/ffmpeg/core/ffmpeg-core.wasm
 *
 * 为什么这样拆：ESM *wrapper* 内部是 `new Worker(new URL(classWorkerURL, import.meta.url))`，
 * 打包器在构建期无法解析；所以主线程用 UMD 包自托管 <script>，worker 必须用 ESM
 * （UMD worker 的动态 import 会被重写成 webpack 运行时，加载不了任意 core URL）。
 *
 * 版本锁定：始终与 package-lock 里安装的 @ffmpeg/* 版本一致。30 MB 的 wasm 不入库，
 * 每次 install/build 重新生成（.gitignore 里已列）。可重复执行。
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { readVersion, resolvePkgDir } from "./lib/resolve-pkg.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const jobs = [
  { pkg: "@ffmpeg/ffmpeg", from: "dist/umd/ffmpeg.js", to: "public/ffmpeg/ffmpeg.js" },
  { pkg: "@ffmpeg/ffmpeg", from: "dist/esm/worker.js", to: "public/ffmpeg/worker/worker.js" },
  { pkg: "@ffmpeg/ffmpeg", from: "dist/esm/const.js", to: "public/ffmpeg/worker/const.js" },
  { pkg: "@ffmpeg/ffmpeg", from: "dist/esm/errors.js", to: "public/ffmpeg/worker/errors.js" },
  { pkg: "@ffmpeg/core", from: "dist/esm/ffmpeg-core.js", to: "public/ffmpeg/core/ffmpeg-core.js" },
  { pkg: "@ffmpeg/core", from: "dist/esm/ffmpeg-core.wasm", to: "public/ffmpeg/core/ffmpeg-core.wasm" },
];

const dirs = new Map();
for (const job of jobs) {
  if (!dirs.has(job.pkg)) {
    const dir = resolvePkgDir(job.pkg, siteRoot);
    if (!dir) {
      console.error(`[sync-ffmpeg-assets] ${job.pkg} is not installed — run npm install first`);
      process.exit(1);
    }
    dirs.set(job.pkg, dir);
  }
  const src = path.join(dirs.get(job.pkg), job.from);
  if (!existsSync(src)) {
    console.error(`[sync-ffmpeg-assets] missing ${src} (unexpected package layout)`);
    process.exit(1);
  }
  const dest = path.join(siteRoot, job.to);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

const mb = (p) => (statSync(p).size / (1024 * 1024)).toFixed(1);
console.log(
  `[sync-ffmpeg-assets] core ${readVersion(dirs.get("@ffmpeg/core"))} (${mb(
    path.join(siteRoot, "public/ffmpeg/core/ffmpeg-core.wasm"),
  )} MB wasm) + wrapper ${readVersion(dirs.get("@ffmpeg/ffmpeg"))} -> public/ffmpeg`,
);
