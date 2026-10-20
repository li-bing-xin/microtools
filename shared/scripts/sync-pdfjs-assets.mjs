/**
 * 把 pdf.js 浏览器运行时从 node_modules 复制进 `public/pdfjs`，PDF 编辑器需要的每个字节
 * 都由本站源提供：没有 CDN、没有第三方请求，worker 版本锁定在安装的 pdfjs-dist 上。
 *
 * 文件：
 *   build/pdf.worker.min.mjs → public/pdfjs/pdf.worker.min.mjs
 *   standard_fonts/          → public/pdfjs/standard_fonts/（没内嵌字体的 PDF）
 *   cmaps/                   → public/pdfjs/cmaps/（CJK / 非拉丁编码）
 *
 * 可重复执行；postinstall 与 prebuild 都跑。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { resolvePkgDir } from "./lib/resolve-pkg.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const PKG = "pdfjs-dist";

const pkgDir = resolvePkgDir(PKG, siteRoot);
if (!pkgDir) {
  console.error(`[sync-pdfjs-assets] ${PKG} is not installed`);
  process.exit(1);
}

const dest = path.join(siteRoot, "public", "pdfjs");
mkdirSync(dest, { recursive: true });

const worker = path.join(pkgDir, "build", "pdf.worker.min.mjs");
if (!existsSync(worker)) {
  console.error(`[sync-pdfjs-assets] worker not found at ${worker}`);
  process.exit(1);
}
cpSync(worker, path.join(dest, "pdf.worker.min.mjs"));

for (const dir of ["standard_fonts", "cmaps"]) {
  const src = path.join(pkgDir, dir);
  if (!existsSync(src)) {
    console.error(`[sync-pdfjs-assets] ${dir} not found at ${src}`);
    process.exit(1);
  }
  rmSync(path.join(dest, dir), { recursive: true, force: true });
  cpSync(src, path.join(dest, dir), { recursive: true });
}

console.log(`[sync-pdfjs-assets] worker + fonts + cmaps -> ${path.relative(siteRoot, dest)}`);
