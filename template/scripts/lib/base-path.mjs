import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { distDir } from "./paths.mjs";

const KEEP_AT_ROOT = new Set(["_headers", "_redirects", "assets", "index.html"]);

/**
 * 子路径部署时把 Vite 产物搬进 dist/web/<base>/：
 * - assets/ 与 public 文件复制到子目录，根上的副本删掉；
 * - HTML 引用是 /<base>/assets/*，所以文件必须真的在 /<base>/assets/；
 * - _headers 留在 assets 目录根部（Workers 约定），并把 /assets/* 改写成 /<base>/assets/*。
 *
 * 两种模式共用：
 * - SPA：keepIndexHtml=true，把 Vite 的 index.html 复制进子目录；
 * - prerender：keepIndexHtml=false，首页 HTML 已经由 prerender 写在子目录里。
 */
export async function relocateForBasePath({ basePath, outRoot, keepIndexHtml }) {
  if (basePath === "/") return false;

  await mkdir(outRoot, { recursive: true });
  await cp(join(distDir, "assets"), join(outRoot, "assets"), { recursive: true });

  for (const entry of await readdir(distDir, { withFileTypes: true })) {
    if (KEEP_AT_ROOT.has(entry.name)) continue;
    const from = join(distDir, entry.name);
    if (resolve(from) === resolve(outRoot)) continue; // 子路径目录自己
    await cp(from, join(outRoot, entry.name), { recursive: true });
    await rm(from, { recursive: true, force: true });
  }

  if (keepIndexHtml) {
    await cp(join(distDir, "index.html"), join(outRoot, "index.html"));
  }

  await rm(join(distDir, "index.html"), { force: true });
  await rm(join(distDir, "assets"), { recursive: true, force: true });

  const headersFile = join(distDir, "_headers");
  try {
    const headers = await readFile(headersFile, "utf8");
    const prefix = basePath.replace(/\/$/, "");
    await writeFile(headersFile, headers.replace(/^\/assets\/\*/m, `${prefix}/assets/*`), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return true;
}
