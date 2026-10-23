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
 * --account-id 省略时，CI deploy job 退回读仓库变量 vars.CLOUDFLARE_ACCOUNT_ID；
 * --print off 生成时不带打印层（PrintDocument + print.css）；默认带；
 * --upstream 省略时取本仓库 origin，再退回 microtools 的 GitHub 地址，
 *   写进站点根的 .shared-upstream，供 scripts/sync-shared.mjs 定位上游。
 *
 * 产出的是 cf 形态（cloudflare.config.ts + `cf deploy` + CI deploy job），
 * 不带任何 wrangler 配置（2026-10-20 拍板；BING-89 B1）。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
    '  Usage: node bin/create-site.mjs <name> [--mode spa|prerender] [--domain https://example.com] [--name "Example Tools"] [--account-id <32-hex>] [--print on|off] [--out <dir>] [--upstream <git-url>]\n',
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

// 打印层默认带上（PrintDocument + print.css）；--print off 的站生成时不带这套。
const printLayer = flags.print ?? "on";
if (printLayer !== "on" && printLayer !== "off") {
  usage(`--print must be "on" or "off": got "${printLayer}"`);
}

// CI deploy job 的账号 ID：给了就写死进 ci.yml（printable-studio 形态），
// 没给就退回仓库变量 vars.CLOUDFLARE_ACCOUNT_ID（GitHub repo settings 里配）。
const accountId = flags["account-id"];
if (accountId && !/^[0-9a-f]{32}$/.test(accountId)) {
  usage(`--account-id must be 32 hex chars: got "${accountId}"`);
}

// 两种模式的构建链都从 vite build 走（@cloudflare/vite-plugin + postbuild 插件按模式
// 跑 deploy-marker / 预渲染 / 校验），npm run build 与 cf deploy 同链。
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
    if (top === "node_modules" || top === "dist") return false;
    if (rel === join("public", "deploy-marker.txt")) return false;
    // TEMPLATE_VERSION 是 microtools 侧的模板版本戳（BING-89 B3），不属于站点。
    if (rel === "TEMPLATE_VERSION") return false;
    return true;
  },
});

// --print off：整块移除打印层（组件 + 样式 + globals.css 的 import 行）。
// 默认（on）什么都不动；两层文件都在，第二个消费方出现时按 BING-47 再收进 shared/。
if (printLayer === "off") {
  rmSync(join(target, "src", "components", "PrintDocument.tsx"));
  rmSync(join(target, "src", "styles", "print.css"));
  const globalsPath = join(target, "src", "styles", "globals.css");
  const globals = readFileSync(globalsPath, "utf8");
  writeFileSync(
    globalsPath,
    globals
      .split("\n")
      .filter((line) => !line.includes("print.css"))
      .join("\n"),
  );
}

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
  __NOT_FOUND_HANDLING__: NOT_FOUND_HANDLING[mode],
  __CLOUDFLARE_ACCOUNT_ID__: accountId ?? "${{ vars.CLOUDFLARE_ACCOUNT_ID }}",
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
const templateVersion = existsSync(join(templateDir, "TEMPLATE_VERSION"))
  ? readFileSync(join(templateDir, "TEMPLATE_VERSION"), "utf8").trim()
  : "unknown";
const buildNote =
  mode === "prerender"
    ? "vite build (postbuild: prerender -> sitemap coverage -> render-mode guard)"
    : "vite build (postbuild: base-path relocation -> render-mode guard)";

const workerName = appName;
const accountIdNote = accountId
  ? `写死在 ci.yml（--account-id）`
  : `走仓库变量 vars.CLOUDFLARE_ACCOUNT_ID（repo Settings -> Secrets and variables -> Actions -> Variables）`;

console.log(`
  Created ${relative(process.cwd(), target) || "."}  (mode: ${mode}, ${domain}, shared ${sharedVersion}, template ${templateVersion})

  Next:
    1. cd ${relative(process.cwd(), target) || "."} && npm install
    2. Set the real domain in src/lib/site.ts${flags.domain ? "" : "  <- placeholder for now"}
    3. Rewrite src/lib/tool.ts + src/lib/faq.ts by hand (no AI filler text)
    4. Replace src/components/ToolSlot.tsx with the real editor（可复用 src/shared/render）${
      mode === "prerender"
        ? "\n    5. Add each indexable route to src/lib/pages.ts (this is the prerender list)"
        : "\n    5. SPA mode: no sitemap/prerender; keep pages.ts only for head metadata"
    }
    6. npm test                                  # shared 边界自检 + rng 冒烟
    7. npm run dev / npm run build               # ${buildNote}
    8. node scripts/sync-shared.mjs --check      # 查上游是否有新 shared（上游：${upstream}）

  首次部署 checklist（cf 形态，仓库里没有 wrangler 配置）：
    [ ] Worker 名：${workerName}（cloudflare.config.ts 的 worker.name；改名就改它，CI 不另配）
    [ ] 域名：site.url = ${domain}${flags.domain ? "" : "（还是占位符，必须先改）"}；
        自定义域 / route 属于 playbook gate 3，先拍板再绑
    [ ] 凭据：GitHub Secret CLOUDFLARE_API_TOKEN（cf auth login 交互式，CI 跑不通）；
        账号 ID ${accountIdNote}
    [ ] 本机先验证：npm run deploy:dry-run，再 npm run deploy（cf deploy 自己跑构建链）
    [ ] 上线判定：node scripts/verify-deploy.mjs <sha> --url ${domain}/deploy-marker.txt
    [ ] 有 secret 要配时用 cf deploy --secrets-file <path>，不要回退 wrangler
    ${
      printLayer === "off"
        ? "注：--print off —— 本站不带打印层（PrintDocument / print.css 已移除）。"
        : "注：打印层（PrintDocument + print.css）已随模板带上，不需要时 --print off 重新生成。"
    }
`);
