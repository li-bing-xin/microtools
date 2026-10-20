/**
 * 把 ONNX Runtime Web 的 WASM 运行时从 node_modules 复制进 `public/models/ort`，
 * 浏览器只从本站源加载它。模式与 sync-mediapipe-wasm 相同：版本锁定在安装的
 * onnxruntime-web 上，postinstall/prebuild 重新生成，产物不入库。
 *
 * 只发 CPU（非 SIMD）构建：它是唯一低于 10 MB 单文件预算的 ORT Web 运行时
 * （ort-wasm.wasm ≈ 9.3 MiB，ort-wasm-simd-threaded.wasm ≈ 11.4 MiB），而车牌检测
 * 是显式的懒加载一次性动作，约 1 s 推理可接受。`plate-detect.ts` 把
 * ort.env.wasm.simd 钉成 false，确保运行时真的选这个文件。
 *
 * 旁边的 ~4.7 MB 车牌模型是入库资产（不是生成物），来源与许可见 public/models/README.md。
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { readVersion, resolvePkgDir } from "./lib/resolve-pkg.mjs";
import { siteRoot } from "./lib/site-root.mjs";

const PKG = "onnxruntime-web";
const FILES = ["ort.wasm.min.js", "ort-wasm.wasm"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const pkgDir = resolvePkgDir(PKG, siteRoot);
if (!pkgDir) {
  console.error(`[sync-ort-wasm] ${PKG} is not installed`);
  process.exit(1);
}
const dist = path.join(pkgDir, "dist");
const dest = path.join(siteRoot, "public", "models", "ort");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

for (const name of FILES) {
  const src = path.join(dist, name);
  if (!existsSync(src)) {
    console.error(`[sync-ort-wasm] missing ${path.relative(siteRoot, src)} — run npm install first`);
    process.exit(1);
  }
  const size = statSync(src).size;
  if (size > MAX_FILE_BYTES) {
    console.error(
      `[sync-ort-wasm] ${name} is ${(size / 1024 / 1024).toFixed(2)} MiB, over the 10 MB per-file budget`,
    );
    process.exit(1);
  }
  copyFileSync(src, path.join(dest, name));
  console.log(`[sync-ort-wasm] ${name} (${(size / 1024 / 1024).toFixed(2)} MiB) -> ${path.relative(siteRoot, dest)}`);
}

console.log(`[sync-ort-wasm] ${PKG}@${readVersion(pkgDir)} runtime synced`);
