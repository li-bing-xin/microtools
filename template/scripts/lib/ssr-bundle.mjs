import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { appRoot } from "./paths.mjs";

const outfile = join(appRoot, "node_modules/.cache/site-ssr/entry.cjs");
const require = createRequire(import.meta.url);

/**
 * 把 src/ssr.tsx 打成 Node 可直接 import 的 ESM。
 *
 * 全部依赖打进 bundle：脚本不依赖 Vite 产物，也不需要单独编译 src/shared 的切片
 * （seo/render 是站内源码，esbuild 直接跟随 `@/shared/*` 的 tsconfig paths 解析）。
 * CSS 用 empty loader：SSR 不需要样式，样式由 vite build 负责。
 */
export async function buildSsrBundle() {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    absWorkingDir: appRoot,
    entryPoints: [join(appRoot, "src/ssr.tsx")],
    outfile,
    bundle: true,
    platform: "node",
    // 输出 CJS：React / use-sync-external-store 是 CJS，打进 ESM 会退化成
    // 「Dynamic require of ... is not supported」。CJS 里 require 是原生的。
    format: "cjs",
    target: "node22",
    jsx: "automatic",
    loader: { ".css": "empty" },
    // React 是 CJS：打进 ESM bundle 会退化成「Dynamic require of "util"」。
    // 让 Node 自己解析，同时也保证 router 与 react-dom/server 用的是同一个 React 实例。
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  return outfile;
}

export async function loadSsrBundle() {
  const file = await buildSsrBundle();
  // 每次清缓存，避免同一进程里跑多次时拿到旧模块。
  delete require.cache[file];
  return require(file);
}
