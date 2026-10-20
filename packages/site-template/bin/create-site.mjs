#!/usr/bin/env node
/**
 * 新站脚手架：把 packages/site-template/template 复制成 apps/<name> 并替换占位符。
 *
 *   node packages/site-template/bin/create-site.mjs pixelate
 *   node packages/site-template/bin/create-site.mjs pixelate --domain https://pixelate.app --name "Pixelate"
 *
 * 只做复制 + 文本替换，不装依赖、不建 git 仓库、不动部署。
 * --domain 省略时用 https://<name>.example.com 占位，上线前必须改；
 * --name 省略时由目录名推导（pixelate -> Pixelate）。
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const templateDir = resolve(here, "../template");
const appsDir = resolve(repoRoot, "apps");

const TEXT_EXT = /\.(tsx?|m?js|jsonc?|css|md|html|ya?ml|txt)$|(^|\/)\.gitignore$/;

function usage(message) {
  if (message) console.error(`\n  ${message}\n`);
  console.error(
    '  Usage: pnpm new-site <app-name> [--domain https://example.com] [--name "Example Tools"]\n',
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

const { positional, flags } = parseArgs(process.argv.slice(2));
const appName = positional[0];
if (!appName) usage();
if (!/^[a-z][a-z0-9-]*$/.test(appName)) usage(`App name must be kebab-case: got "${appName}"`);

const domain = flags.domain ?? `https://${appName}.example.com`;
const siteName = flags.name ?? titleCase(appName);

// 公开根 URL：https 源 + 可选子路径，不带尾斜杠/查询/哈希。
if (!/^https:\/\/[^/?#]+(\/[^/?#][^?#]*)?$/.test(domain) || domain.endsWith("/")) {
  usage(
    `--domain must be an https URL without a trailing slash (https://example.com or https://example.com/tools): got "${domain}"`,
  );
}

const target = join(appsDir, appName);
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

const replacements = {
  __APP_NAME__: appName,
  __SITE_NAME__: siteName,
  __SITE_URL__: domain,
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

console.log(`
  Created apps/${appName}  (${domain})

  Next:
    1. pnpm install
    2. Set the real domain in src/lib/site.ts${flags.domain ? "" : "  <- placeholder for now"}
    3. Rewrite src/lib/tool.ts + src/lib/faq.ts by hand (no AI filler text)
    4. Replace src/components/ToolSlot.tsx with the real editor
    5. Flip live: true in src/lib/tool.ts only when the tool actually works
    6. pnpm --filter ${appName} dev
    7. pnpm --filter ${appName} build   # vite build -> prerender -> sitemap coverage
`);
