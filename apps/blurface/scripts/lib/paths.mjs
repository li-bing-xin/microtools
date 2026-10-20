import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** scripts/ 在站点根下，向上两级就是站点根。 */
export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** vite build 的产物目录。 */
export const distDir = join(appRoot, "dist/web");

/**
 * 真实发布的目录：basePath 为 "/" 时就是 dist/web；
 * 子路径部署（"/tools/"）时是 dist/web/tools。
 */
export function outputRoot(basePath) {
  return join(distDir, basePath.replace(/^\/+|\/+$/g, ""));
}

export function displayPath(path) {
  return relative(appRoot, path) || ".";
}

/**
 * 产物内路径："/" -> index.html，"/privacy" -> privacy.html。
 *
 * 扁平 `*.html` 而不是模板默认的 `privacy/index.html`：blurface 线上是 Next
 * `output: "export"` 的产物形态，`/privacy` 200 直出、`/privacy/` 307 回无斜杠；
 * 目录形态会让 `/privacy` 变成 307 → `/privacy/`，等于改了 URL 形态。
 * src/lib/pages.ts 的 outputPathFor 必须与本函数保持一致。
 */
export function outputPathFor(path) {
  if (path === "/") return "index.html";
  return `${path.replace(/^\/+|\/+$/g, "")}.html`;
}

/** 预渲染产物之外允许出现在 dist/web 里的 HTML。 */
export const ALLOWED_EXTRA_HTML = new Set(["404.html"]);
