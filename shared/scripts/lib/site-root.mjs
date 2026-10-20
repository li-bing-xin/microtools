/**
 * 定位站点根目录（含 package.json 的那一层）。
 *
 * shared/scripts 会被复制到两种位置，脚本自己不能假设 `__dirname/..` 就是站点根：
 *   - `<site>/src/shared/scripts/*.mjs`（同步协议的标准位置）
 *   - `<site>/scripts/*.mjs`（站点想放平也可以）
 * 统一从脚本文件本身向上走到最近的 package.json；node_modules 里的 package.json 不算。
 */
import { existsSync } from "node:fs";
import { dirname, join, parse, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function findSiteRoot(fromFileUrl = import.meta.url) {
  let dir = dirname(fileURLToPath(fromFileUrl));
  const { root } = parse(dir);

  while (true) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest) && !dir.split(sep).includes("node_modules")) return dir;
    if (dir === root) {
      throw new Error(
        `[shared/scripts] no package.json found above ${dirname(fileURLToPath(fromFileUrl))} — run this script from inside a site checkout`,
      );
    }
    dir = dirname(dir);
  }
}

/** 站点根；脚本一加载就算好，出错时直接抛出可读信息。 */
export const siteRoot = findSiteRoot();
