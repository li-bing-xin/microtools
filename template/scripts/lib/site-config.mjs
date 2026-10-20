import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { appRoot } from "./paths.mjs";

const outfile = join(appRoot, "node_modules/.cache/site-config/config.cjs");
const require = createRequire(import.meta.url);

/**
 * 读取 src/lib/site.ts 的站点配置（含 renderMode / basePath）。
 *
 * 脚本是 .mjs，直接 import TS 不行；用 esbuild 把 site.ts 打成一个极小的 CJS
 * （site.ts 只有常量和类型 import，不会拖 React）。构建脚本和校验脚本共用，
 * 避免在多个地方重复解析 URL / basePath。
 */
export async function loadSiteConfig() {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    absWorkingDir: appRoot,
    entryPoints: [join(appRoot, "src/lib/site.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "warning",
  });

  delete require.cache[outfile];
  return require(outfile);
}
