#!/usr/bin/env node
/**
 * 新站脚手架：复制 template/ 到目标目录，把 shared/ 复制成站点自己的 src/shared/。
 *
 *   node bin/create-site.mjs pixelate                        # SPA（默认）
 *   node bin/create-site.mjs pixelate --mode prerender        # 需要收录的站点
 *   node bin/create-site.mjs pixelate --mode prerender --domain https://pixelate.app --name "Pixelate"
 *   node bin/create-site.mjs pixelate --out ~/code/pixelate   # 指定生成目录
 *
 * 默认生成到 microtools 的**同级目录** `../<name>`：每个站点一个独立仓库，
 * 不再有 apps/ 容器（见 docs/adr/0003-shared-by-copy.md）。
 *
 * 只做复制 + 文本替换：不装依赖、不建 git 仓库、不动部署。
 * --mode：spa（默认，客户端路由、无 sitemap）或 prerender（显式清单构建期预渲染）。
 * --domain 省略时用 https://<name>.example.com 占位，上线前必须改；
 * --name 省略时由目录名推导（pixelate -> Pixelate）；
 * --upstream 省略时取本仓库 origin，再退回 microtools 的 GitHub 地址，
 *   写进站点根的 .shared-upstream，供 scripts/sync-shared.mjs 定位上游。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const templateDir = join(repoRoot, "template");
const sharedDir = join(repoRoot, "shared");
const DEFAULT_UPSTREAM = "https://github.com/li-bing-xin/microtools.git";
const TEXT_EXT = /\.(tsx?|m?js|jsonc?|css|md|html|ya?ml|txt)$|(^|\/)\.gitignore$/;

function usage(message) {
  if (message) console.error(`\n  ${message}\n`);
  console.error(
    '  Usage: node bin/create-site.mjs <name> [--mode spa|prerender] [--domain https://example.com] [--name "Example Tools"] [--out <dir>] [--upstream <git-url>]\n',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) usage(`Missing value for --${key}`);
      flags[key] = value;
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function titleCase(appName) {
  return appName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveUpstream(flag) {
  if (flag) return flag;
  if (process.env.SHARED_UPSTREAM) return process.env.SHARED_UPSTREAM;
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8" });
  if (remote.status === 0 && remote.stdout.trim()) return remote.stdout.trim();
  return DEFAULT_UPSTREAM;
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const appName = positional[0];
if (!appName) usage();
if (!/^[a-z][a-z0-9-]*$/.test(appName)) usage(`App name must be kebab-case: got "${appName}"`);

const mode = flags.mode ?? "spa";
if (mode !== "spa" && mode !== "prerender") {
  usage(`--mode must be "spa" or "prerender": got "${mode}"`);
}

// 两种模式的构建链不同：SPA 不跑预渲染/sitemap；prerender 跑完整 SEO 链。
const BUILD_SCRIPTS = {
  spa: [
    "node src/shared/scripts/write-deploy-marker.mjs",
    "vite build",
    "node scripts/relocate-base-path.mjs",
    "node scripts/verify-render-mode.mjs",
  ].join(" && "),
  prerender: [
    "node src/shared/scripts/write-deploy-marker.mjs",
    "vite build",
    "node scripts/prerender-marketing.mjs",
    "node scripts/write-static-seo-files.mjs",
    "node scripts/verify-prerender-output.mjs",
    "node scripts/verify-sitemap-coverage.mjs",
    "node scripts/verify-render-mode.mjs",
  ].join(" && "),
};

const NOT_FOUND_HANDLING = {
  spa: "single-page-application",
  prerender: "404-page",
};

const domain = flags.domain ?? `https://${appName}.example.com`;
const siteName = flags.name ?? titleCase(appName);

// 公开根 URL：https 源 + 可选子路径，不带尾斜杠/查询/哈希。
if (!/^https:\/\/[^/?#]+(\/[^/?#][^?#]*)?$/.test(domain) || domain.endsWith("/")) {
  usage(
    `--domain must be an https URL without a trailing slash (https://example.com or https://example.com/tools): got "${domain}"`,
  );
}

if (!existsSync(join(sharedDir, "VERSION"))) {
  usage("missing shared/VERSION — this checkout of microtools is incomplete");
}

const target = flags.out ? resolve(flags.out) : resolve(repoRoot, "..", appName);
if (existsSync(target) && readdirSync(target).length > 0) {
  usage(`${target} already exists and is not empty`);
}

cpSync(templateDir, target, {
  recursive: true,
  filter: (source) => {
    const rel = relative(templateDir, source);
    if (rel === "") return true;
    const top = rel.split(sep)[0];
    if (top === "node_modules" || top === "dist" || top === ".wrangler") return false;
    if (rel === join("public", "deploy-marker.txt")) return false;
    return true;
  },
});

// 共享切片整棵复制：站点里的 src/shared 与上游 shared/ 逐字节一致（VERSION 也在内）。
// 之后只通过 `node scripts/sync-shared.mjs --to <version>` 升级，站内不手改。
cpSync(sharedDir, join(target, "src", "shared"), { recursive: true });
const upstream = resolveUpstream(flags.upstream);
writeFileSync(join(target, ".shared-upstream"), `${upstream}\n`);

const replacements = {
  __APP_NAME__: appName,
  __SITE_NAME__: siteName,
  __SITE_URL__: domain,
  __RENDER_MODE__: mode,
  __BUILD_SCRIPT__: BUILD_SCRIPTS[mode],
  __NOT_FOUND_HANDLING__: NOT_FOUND_HANDLING[mode],
};

function rewrite(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      rewrite(path);
      continue;
    }
    if (!TEXT_EXT.test(entry)) continue;
    let content = readFileSync(path, "utf8");
    let changed = false;
    for (const [token, value] of Object.entries(replacements)) {
      if (content.includes(token)) {
        content = content.split(token).join(value);
        changed = true;
      }
    }
    if (changed) writeFileSync(path, content);
  }
}

rewrite(target);

const sharedVersion = readFileSync(join(sharedDir, "VERSION"), "utf8").trim();
const buildNote =
  mode === "prerender"
    ? "vite build -> prerender -> sitemap coverage -> render-mode guard"
    : "vite build -> base-path relocation -> render-mode guard (no sitemap)";

console.log(`
  Created ${relative(process.cwd(), target) || "."}  (mode: ${mode}, ${domain}, shared ${sharedVersion})

  Next:
    1. cd ${relative(process.cwd(), target) || "."} && npm install
    2. Set the real domain in src/lib/site.ts${flags.domain ? "" : "  <- placeholder for now"}
    3. Rewrite src/lib/tool.ts + src/lib/faq.ts by hand (no AI filler text)
    4. Replace src/components/ToolSlot.tsx with the real editor（可复用 src/shared/render）${
      mode === "prerender"
        ? "\n    5. Add each indexable route to src/lib/pages.ts (this is the prerender list)"
        : "\n    5. SPA mode: no sitemap/prerender; keep pages.ts only for head metadata"
    }
    6. npm test                                  # shared 边界自检
    7. npm run dev / npm run build               # ${buildNote}
    8. node scripts/sync-shared.mjs --check      # 查上游是否有新 shared（上游：${upstream}）
`);
