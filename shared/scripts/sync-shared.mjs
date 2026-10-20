#!/usr/bin/env node
/**
 * shared/ 同步器：把上游 microtools 的 `shared/` 拉到本站 `src/shared/`。
 *
 *   node scripts/sync-shared.mjs --check                 只比对：本地 VERSION vs 上游最新 tag，落后 exit 1
 *   node scripts/sync-shared.mjs --to 1.2.0              拉到指定版本：覆盖 src/shared/ + 改 VERSION
 *   node scripts/sync-shared.mjs --to 1.2.0 --dry-run    只打印将变更的文件清单，不写盘
 *
 * 协议（完整说明见 microtools 的 docs/shared-protocol.md）：
 * - 上游用 git tag `vX.Y.Z` 定位；不走 registry、不用 submodule、不建 workspace 依赖。
 * - 复制 + 版本戳：本站 `src/shared/VERSION` 记录当前版本；`shared/` 有任何文件变更就必须 bump tag。
 * - 同步后自动重跑 `npm run build`，项目有 `npm test` 则一并跑；任一失败就回滚 src/shared 并报错。
 * - `src/shared/DIVERGED.md` 存在 = 本站有意不跟随上游：`--check` 跳过，`--to` 拒绝。
 *
 * 上游地址来源优先级：`--upstream <git-url|本地路径>` → 环境变量 SHARED_UPSTREAM → 站根 `.shared-upstream`。
 * 其它开关：`--skip-verify` 只跳过 build/test（离线 bootstrap 用，不推荐）。
 *
 * 退出码：0 成功/已是最新/有意分叉；1 --check 落后 或 --to 失败（已回滚）；2 用法/配置错误。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findSiteRoot } from "./lib/site-root.mjs";

const SITE_ROOT = findSiteRoot(import.meta.url);
const SHARED_DIR = path.join(SITE_ROOT, "src", "shared");
const VERSION_FILE = path.join(SHARED_DIR, "VERSION");
const DIVERGED_FILE = path.join(SHARED_DIR, "DIVERGED.md");
const UPSTREAM_FILE = path.join(SITE_ROOT, ".shared-upstream");
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

// ---------------------------------------------------------------- 输出

const ok = (message) => console.log(`  ok    ${message}`);
const info = (message) => console.log(`  ·     ${message}`);
const warn = (message) => console.log(`  warn  ${message}`);

class UsageError extends Error {}
class SyncError extends Error {}

function fail(message) {
  throw new SyncError(message);
}

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const flags = { check: false, dryRun: false, skipVerify: false, to: null, upstream: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") flags.check = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--skip-verify") flags.skipVerify = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--to") flags.to = normalizeVersion(argv[++i], "--to");
    else if (arg === "--upstream") {
      flags.upstream = argv[++i];
      if (!flags.upstream || flags.upstream.startsWith("--")) throw new UsageError("--upstream requires a git URL or path");
    } else if (arg.startsWith("--")) throw new UsageError(`unknown flag: ${arg}`);
    else throw new UsageError(`unexpected argument: ${arg}`);
  }
  if (flags.check && flags.to) throw new UsageError("--check and --to are mutually exclusive");
  if (!flags.check && !flags.to && !flags.help) throw new UsageError("one of --check or --to <version> is required");
  if (flags.dryRun && !flags.to) throw new UsageError("--dry-run only makes sense with --to <version>");
  return flags;
}

const USAGE = `
  node scripts/sync-shared.mjs --check
  node scripts/sync-shared.mjs --to <version> [--dry-run] [--skip-verify]
  node scripts/sync-shared.mjs --to <version> --upstream <git-url|path>

  --check            本地 VERSION 与上游最新 tag 比对，落后时 exit 1
  --to <version>     拉到该版本（形如 1.2.0 或 v1.2.0）
  --dry-run          只打印将变更的文件，不写盘
  --upstream <url>   覆盖上游地址（默认读站根 .shared-upstream）
  --skip-verify      跳过同步后的 build/test（仅离线 bootstrap 用）
`;

// ---------------------------------------------------------------- 版本

function normalizeVersion(value, source) {
  const parsed = parseVersion(value);
  if (!parsed) throw new UsageError(`${source ?? "version"} must look like 1.2.0 (got "${value ?? ""}")`);
  return parsed.raw;
}

function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value ?? "").trim());
  if (!match) return null;
  return {
    raw: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}

/** semver 比较：-1 / 0 / 1。prerelease 低于同版本正式版。 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new UsageError(`cannot compare "${a}" with "${b}"`);
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] < right.parts[i] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

function readLocalVersion() {
  if (!existsSync(VERSION_FILE)) {
    fail(`missing src/shared/VERSION — is this a site generated by microtools? (${path.relative(SITE_ROOT, VERSION_FILE)})`);
  }
  const version = parseVersion(readFileSync(VERSION_FILE, "utf8"));
  if (!version) fail(`src/shared/VERSION is not a valid version: "${readFileSync(VERSION_FILE, "utf8").trim()}"`);
  return version.raw;
}

function hasDiverged() {
  return existsSync(DIVERGED_FILE);
}

// ---------------------------------------------------------------- 上游

function resolveUpstream(explicit) {
  const candidate = explicit ?? process.env.SHARED_UPSTREAM ?? readUpstreamFile();
  if (!candidate) {
    fail(
      "no upstream configured — write the microtools git URL into .shared-upstream, set SHARED_UPSTREAM, or pass --upstream <url>",
    );
  }
  return candidate.trim();
}

function readUpstreamFile() {
  if (!existsSync(UPSTREAM_FILE)) return null;
  const value = readFileSync(UPSTREAM_FILE, "utf8").trim();
  return value.startsWith("#") || value === "" ? null : value;
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  return result;
}

/** 上游所有 `vX.Y.Z` tag，按版本降序。 */
function remoteTags(upstream) {
  const result = git(["ls-remote", "--tags", "--refs", upstream], SITE_ROOT);
  if (result.status !== 0) {
    fail(`git ls-remote failed for ${upstream}:\n${(result.stderr ?? "").trim()}`);
  }
  const tags = (result.stdout ?? "")
    .split("\n")
    .map((line) => line.split("\t")[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, ""))
    .filter((tag) => parseVersion(tag))
    .map((tag) => parseVersion(tag).raw);
  return [...new Set(tags)].sort((a, b) => compareVersions(b, a));
}

/** 浅克隆上游到临时目录，返回 { dir, sharedDir, cleanup }。 */
function fetchUpstream(upstream, version) {
  const tmp = mkdtempSync(path.join(tmpdir(), "sync-shared-"));
  const cloneDir = path.join(tmp, "upstream");
  const result = git(
    ["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, upstream, cloneDir],
    SITE_ROOT,
  );
  if (result.status !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    fail(`upstream has no tag v${version} (or the clone failed):\n${(result.stderr ?? "").trim()}`);
  }
  const sharedDir = path.join(cloneDir, "shared");
  if (!existsSync(sharedDir)) {
    rmSync(tmp, { recursive: true, force: true });
    fail(`upstream tag v${version} has no shared/ directory`);
  }
  return { sharedDir, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------- 文件树

function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push({ rel: path.relative(root, abs).split(path.sep).join("/"), abs });
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** 目标树相对源树的变更（源 = 上游新版本，目标 = 本站当前 src/shared）。 */
function diffTrees(sourceRoot, targetRoot) {
  const source = new Map(listFiles(sourceRoot).map((entry) => [entry.rel, entry]));
  const target = new Map(listFiles(targetRoot).map((entry) => [entry.rel, entry]));
  const added = [];
  const modified = [];
  const deleted = [];
  const unchanged = [];

  for (const [rel, entry] of source) {
    const current = target.get(rel);
    if (!current) added.push({ rel, size: statSync(entry.abs).size });
    else if (digest(entry.abs) !== digest(current.abs)) {
      modified.push({ rel, before: statSync(current.abs).size, after: statSync(entry.abs).size });
    } else unchanged.push(rel);
  }
  for (const [rel] of target) {
    if (!source.has(rel)) deleted.push({ rel, size: statSync(target.get(rel).abs).size });
  }
  return { added, modified, deleted, unchanged };
}

function kilobytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

const MAX_LISTED = 40;

function printDiff(diff) {
  const total = diff.added.length + diff.modified.length + diff.deleted.length;
  console.log(
    `\n  变更：+${diff.added.length} 新增 / ~${diff.modified.length} 修改 / -${diff.deleted.length} 删除（共 ${total} 个文件，${diff.unchanged.length} 个未变）\n`,
  );
  if (total === 0) {
    console.log("  （src/shared 与目标版本完全一致）\n");
    return;
  }
  const rows = [
    ...diff.added.map((entry) => `  + ${entry.rel.padEnd(38)} ${kilobytes(entry.size).padStart(9)}`),
    ...diff.modified.map((entry) => `  ~ ${entry.rel.padEnd(38)} ${kilobytes(entry.before)} -> ${kilobytes(entry.after)}`),
    ...diff.deleted.map((entry) => `  - ${entry.rel.padEnd(38)} ${kilobytes(entry.size).padStart(9)}`),
  ];
  for (const row of rows.slice(0, MAX_LISTED)) console.log(row);
  if (rows.length > MAX_LISTED) console.log(`  … 另有 ${rows.length - MAX_LISTED} 个文件`);
  console.log("");
}

// ---------------------------------------------------------------- 同步

function applyTree(sourceRoot, targetRoot) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  cpSync(sourceRoot, targetRoot, { recursive: true });
}

function readUpstreamVersion(sharedDir) {
  const file = path.join(sharedDir, "VERSION");
  if (!existsSync(file)) return null;
  return parseVersion(readFileSync(file, "utf8"))?.raw ?? null;
}

function npmScriptExists(script) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(SITE_ROOT, "package.json"), "utf8"));
    return Boolean(manifest.scripts?.[script]);
  } catch {
    return false;
  }
}

const ANSI = /\u001B\[[0-9;]*m/g;

function runScript(script) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  info(`npm run ${script}`);
  const result = spawnSync(npm, ["run", script], {
    cwd: SITE_ROOT,
    encoding: "utf8",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(ANSI, "").trim();
  if (result.status !== 0) {
    const tail = output.split("\n").slice(-30).join("\n");
    console.error(`\n----- npm run ${script} failed (exit ${result.status ?? "?"}) -----\n${tail}\n`);
    return false;
  }
  return true;
}

function verifyBuild() {
  if (npmScriptExists("build") && !runScript("build")) return false;
  if (npmScriptExists("test") && !runScript("test")) return false;
  return true;
}

function syncTo(version, { dryRun, skipVerify, upstream }) {
  if (hasDiverged()) {
    fail(
      `src/shared/DIVERGED.md exists — this site intentionally diverged from upstream. Remove the file (and reconcile by hand) before --to ${version}.`,
    );
  }

  const local = readLocalVersion();
  const comparison = compareVersions(version, local);
  if (comparison === 0) {
    ok(`already at ${local} — nothing to do`);
    return 0;
  }

  console.log(`\n  ${path.basename(SITE_ROOT)}  ${local} -> ${version}   (upstream: ${upstream})`);
  const fetched = fetchUpstream(upstream, version);
  try {
    const declared = readUpstreamVersion(fetched.sharedDir);
    if (declared !== version) {
      fail(
        `upstream tag v${version} declares shared/VERSION = ${declared ?? "(missing)"} — bump VERSION in the same commit as the tag, then retry.`,
      );
    }

    const diff = diffTrees(fetched.sharedDir, SHARED_DIR);
    printDiff(diff);

    if (dryRun) {
      ok(`dry run — ${diff.added.length + diff.modified.length + diff.deleted.length} file(s) would change, nothing written`);
      return 0;
    }

    const backup = mkdtempSync(path.join(tmpdir(), "sync-shared-backup-"));
    const backupDir = path.join(backup, "shared");
    cpSync(SHARED_DIR, backupDir, { recursive: true });

    try {
      applyTree(fetched.sharedDir, SHARED_DIR);
      writeFileSync(VERSION_FILE, `${version}\n`);
      ok(`copied shared/ -> src/shared (${version})`);

      if (skipVerify) {
        rmSync(backup, { recursive: true, force: true });
        warn("--skip-verify: build/test skipped — run them yourself before opening a PR");
        return 0;
      }

      console.log("");
      if (!verifyBuild()) {
        throw new Error("build/test failed after syncing");
      }
      ok(`build${npmScriptExists("test") ? " + test" : ""} passed`);
      rmSync(backup, { recursive: true, force: true });
      console.log(`\n  同步完成：${path.basename(SITE_ROOT)} 现在使用 shared ${version}。请提交 src/shared/ 与 VERSION 的变更。\n`);
      return 0;
    } catch (error) {
      rmSync(SHARED_DIR, { recursive: true, force: true });
      cpSync(backupDir, SHARED_DIR, { recursive: true });
      console.error(`\n  ✗ ${error.message}`);
      console.error(`  已回滚 src/shared 到 ${local}（备份：${backupDir}）\n`);
      return 1;
    }
  } finally {
    fetched.cleanup();
  }
}

function check({ upstream }) {
  const local = readLocalVersion();
  const tags = remoteTags(upstream);

  if (hasDiverged()) {
    ok(`src/shared/DIVERGED.md present — skipping check (local ${local}, upstream tags: ${tags.length})`);
    return 0;
  }
  if (tags.length === 0) {
    fail(`upstream ${upstream} has no vX.Y.Z tags`);
  }

  const latest = tags[0];
  const comparison = compareVersions(local, latest);
  if (comparison === 0) {
    ok(`${path.basename(SITE_ROOT)}: shared ${local} is up to date (latest tag v${latest})`);
    return 0;
  }
  if (comparison > 0) {
    warn(`${path.basename(SITE_ROOT)}: shared ${local} is ahead of the latest tag v${latest} (unreleased local state?)`);
    return 0;
  }
  console.error(
    `\n  ✗ ${path.basename(SITE_ROOT)}: shared ${local} is behind — latest tag is v${latest}\n    run: node scripts/sync-shared.mjs --to ${latest}\n`,
  );
  console.error(`  可用版本：${tags.slice(0, 10).map((tag) => `v${tag}`).join(", ")}${tags.length > 10 ? ` … (${tags.length} 个)` : ""}\n`);
  return 1;
}

// ---------------------------------------------------------------- main

function main() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`\n  ${error.message}\n${USAGE}`);
    process.exit(2);
  }

  if (flags.help) {
    console.log(USAGE);
    return;
  }

  try {
    if (!existsSync(SHARED_DIR)) {
      fail(`missing src/shared — is ${SITE_ROOT} a site generated by microtools?`);
    }
    const upstream = resolveUpstream(flags.upstream);
    const code = flags.check
      ? check({ upstream })
      : syncTo(flags.to, { dryRun: flags.dryRun, skipVerify: flags.skipVerify, upstream });
    process.exit(code);
  } catch (error) {
    if (!(error instanceof SyncError)) throw error;
    console.error(`\n  ✗ ${error.message}\n`);
    process.exit(2);
  }
}

main();
