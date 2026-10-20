#!/usr/bin/env node
/**
 * 生成 public/deploy-marker.txt（gitignored）：git sha + UTC 时间，每次构建更新。
 *
 * 部署后 curl /deploy-marker.txt，内容里的 sha 与本 commit 一致才算真的上线，
 * 解决「合并 ≠ 上线」（见 scripts/verify-deploy.mjs）。
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveSha() {
  if (process.env.CI_COMMIT_SHA) return process.env.CI_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: appRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

const sha = resolveSha();
const releasedAt = new Date().toISOString();
const body = `blurface deploy marker\ngit_sha=${sha}\nreleased_at_utc=${releasedAt}\n`;

writeFileSync(join(appRoot, "public", "deploy-marker.txt"), body);
console.log(`[deploy-marker] git_sha=${sha} released_at_utc=${releasedAt}`);
