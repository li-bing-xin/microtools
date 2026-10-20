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

/** 产物内路径："/" -> index.html，"/privacy" -> privacy/index.html。 */
export function outputPathFor(path) {
  if (path === "/") return "index.html";
  return `${path.replace(/^\/+|\/+$/g, "")}/index.html`;
}
