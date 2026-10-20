/**
 * 生成 `public/deploy-marker.txt`（gitignored）：站点名 + git sha + UTC 时间，每次构建更新。
 *
 * 验证手法照抄 web-annotator-nextjs 的 HANDOFF：`curl /deploy-marker.txt` 内容里的 sha
 * 与本 commit 一致才算真的上线（解决「合并 ≠ 上线」）。CI 里取平台注入的 CI_COMMIT_SHA /
 * GITHUB_SHA，本地退回 git rev-parse。
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { siteRoot } from "./lib/site-root.mjs";

function siteName() {
  try {
    return JSON.parse(readFileSync(path.join(siteRoot, "package.json"), "utf8")).name ?? "site";
  } catch {
    return path.basename(siteRoot);
  }
}

function resolveSha() {
  if (process.env.CI_COMMIT_SHA) return process.env.CI_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: siteRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

const sha = resolveSha();
const releasedAt = new Date().toISOString();
const body = `${siteName()} deploy marker\ngit_sha=${sha}\nreleased_at_utc=${releasedAt}\n`;

const publicDir = path.join(siteRoot, "public");
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, "deploy-marker.txt"), body);
console.log(`[deploy-marker] git_sha=${sha} released_at_utc=${releasedAt}`);
