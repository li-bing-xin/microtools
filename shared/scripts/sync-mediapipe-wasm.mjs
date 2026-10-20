/**
 * 把 MediaPipe tasks-vision 的 WASM 运行时从 node_modules 复制进 `public/models/wasm`，
 * 浏览器只从本站源加载它：运行时零第三方请求，「文件不离开浏览器」的承诺才成立。
 *
 * 版本锁定：wasm 永远与 package-lock 里安装的 @mediapipe/tasks-vision 版本一致。
 * 可重复执行；postinstall 与 prebuild 都跑。
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolvePkgDir } from "./lib/resolve-pkg.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const PKG = "@mediapipe/tasks-vision";

const pkgDir = resolvePkgDir(PKG, siteRoot);
if (!pkgDir) {
  console.error(`[sync-mediapipe-wasm] ${PKG} is not installed`);
  process.exit(1);
}
const src = path.join(pkgDir, "wasm");
const dest = path.join(siteRoot, "public", "models", "wasm");

if (!existsSync(src)) {
  console.error(`[sync-mediapipe-wasm] wasm runtime not found at ${src}`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[sync-mediapipe-wasm] ${readdirSync(dest).length} files -> ${path.relative(siteRoot, dest)}`);
