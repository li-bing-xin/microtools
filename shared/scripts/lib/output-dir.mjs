/**
 * 构建产物目录：Next 是 `out/`，Vite 模板是 `dist/web/`，其它静态站多半是 `dist/`。
 *
 * 优先级：`--out <dir>` 参数 → `SITE_OUT_DIR` 环境变量 → 依次探测 out / dist/web / dist。
 * 探测而不是写死，是因为同一份脚本要同时服务 Next 站位与 Vite 站点。
 */
import { statSync } from "node:fs";
import { resolve } from "node:path";

const FALLBACKS = ["out", "dist/web", "dist"];

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function resolveOutputDir(siteRoot, explicit) {
  const candidates = [explicit, process.env.SITE_OUT_DIR, ...FALLBACKS].filter(Boolean);
  for (const candidate of candidates) {
    const path = resolve(siteRoot, candidate);
    if (isDir(path)) return path;
  }
  throw new Error(
    `[shared/scripts] no build output found (tried ${FALLBACKS.join(", ")}) — run the site build first, or pass --out <dir>`,
  );
}

/** 从 argv 里取 `--out <dir>`；脚本自己解析，不引依赖。 */
export function outFlag(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--out");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("--out requires a directory");
  return value;
}
