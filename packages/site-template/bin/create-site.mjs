#!/usr/bin/env node
/**
 * 新站脚手架：把 packages/site-template/template 复制成 apps/<name> 并替换占位符。
 *
 *   pnpm new-site mytool --domain https://mytool.app --name "My Tool"
 *
 * 只做复制 + 文本替换，不装依赖、不建 git 仓库、不动部署。做完这一步就该去人工写文案。
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const templateDir = resolve(here, "../template");
const appsDir = resolve(repoRoot, "apps");

const TEXT_EXT = /\.(tsx?|json|css|md|mjs|txt)$|(^|\/)\.gitignore$/;

function usage(message) {
  if (message) console.error(`\n  ${message}\n`);
  console.error('  Usage: pnpm new-site <app-name> --domain https://example.com --name "Example Tools"\n');
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

const { positional, flags } = parseArgs(process.argv.slice(2));
const appName = positional[0];
if (!appName) usage();
if (!/^[a-z][a-z0-9-]*$/.test(appName)) usage(`App name must be kebab-case: got "${appName}"`);
const domain = flags.domain;
const siteName = flags.name ?? appName;
if (!domain) usage("--domain is required (e.g. https://example.com)");
if (!/^https:\/\/[^/]+$/.test(domain)) usage(`--domain must be an https origin without trailing slash: got "${domain}"`);

const target = join(appsDir, appName);
if (existsSync(target) && readdirSync(target).length > 0) {
  usage(`${target} already exists and is not empty`);
}

cpSync(templateDir, target, { recursive: true });

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
  Created apps/${appName}

  Next:
    1. pnpm install
    2. Write lib/tool.ts + lib/faq.ts + page copy by hand (no AI filler text)
    3. Replace components/ToolSlot.tsx with the real editor
    4. Flip live: true in lib/tool.ts only when the tool actually works
    5. pnpm --filter ${appName} build
`);
