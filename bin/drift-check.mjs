#!/usr/bin/env node
/**
 * 共享层漂移检测（BING-48 autopilot 的探测端）。
 *
 *   node bin/drift-check.mjs                        # 扫描 --owner 下所有未归档仓库，人可读报告
 *   node bin/drift-check.mjs --json                 # 结构化输出（含建议工单 title/body，供 agent 开单）
 *   node bin/drift-check.mjs --repo <name>          # 只看一个仓库
 *   node bin/drift-check.mjs --self-test            # 纯函数自检，不出网
 *
 * 做什么：对每个带 `src/shared/VERSION` 的仓库（= microtools 协议消费方），
 * 比对其 VERSION 与其上游（站根 `.shared-upstream`，缺省 microtools）的最新 `vX.Y.Z` tag。
 *
 * 只检测、不升级：升级由人或 agent 按工单走 PR 流程（`scripts/sync-shared.mjs --to <v>`）。
 *
 * 状态语义：
 *   ok        VERSION = 最新 tag
 *   behind    VERSION < 最新 tag —— 检测端产出建议工单（每站每版本一张，去重由开单方负责）
 *   ahead     VERSION > 最新 tag（本地未发版？）—— 报告提示，不开单
 *   diverged  存在 src/shared/DIVERGED.md —— 有意分叉，跳过（报告列一行）
 *   unknown   上游读不到 / 数据坏 —— 明确写「无法判定」，绝不默认为最新
 *   skip      没有 src/shared/VERSION，不是消费方（microtools 自身也在此列）
 *
 * 退出码：0 正常（含 unknown / diverged）；1 存在 behind；2 用法或致命错误。
 *
 * 实现说明：semver 解析/比较与 shared/scripts/sync-shared.mjs 同源（有意内联复制，
 * 避免「为工作区侧工具改 shared/ → 被迫 bump tag」）；上游 tag 用 `git ls-remote`，
 * 变更摘要用 GitHub compare API —— 与站点侧 sync-shared 的定位方式一致（只认 tag）。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_UPSTREAM = "https://github.com/li-bing-xin/microtools.git";
const DEFAULT_UPSTREAM_REPO = "microtools"; // 上游自身不是消费方
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const SHARED_SLICES = ["seo", "render", "scripts"];
const SLICE_IMPACT = {
  seo: "seo 切片 → sitemap / JSON-LD / metadata 生成",
  render: "render 切片 → 编辑器渲染（effects/coords）、导出画质上限",
  scripts: "scripts 切片 → 部署标记 / 资源同步 / shared 同步器",
};

// ---------------------------------------------------------------- 基础

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) return { status: -1, stdout: "", stderr: result.error.message };
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** gh api 调用。返回 { ok, notFound, body, error }。 */
function ghApi(target, { jq, raw } = {}) {
  const args = ["api", target];
  if (raw) args.push("-H", "Accept: application/vnd.github.raw");
  if (jq) args.push("--jq", jq);
  const result = run("gh", args);
  if (result.status === 0) return { ok: true, notFound: false, body: result.stdout, error: null };
  const notFound = /\b404\b|Not Found/i.test(result.stderr);
  return { ok: false, notFound, body: null, error: result.stderr.trim() || `gh api exit ${result.status}` };
}

// ---------------------------------------------------------------- 版本（与 sync-shared.mjs 同源）

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
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] < right.parts[i] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

function sortedTagsDesc(tags) {
  return [...new Set(tags.filter((tag) => parseVersion(tag)).map((tag) => parseVersion(tag).raw))].sort((a, b) =>
    compareVersions(b, a),
  );
}

function parseRepoSlugFromGitUrl(url) {
  const match = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i.exec(String(url ?? "").trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

// ---------------------------------------------------------------- 扫描

function listRepos(owner) {
  const result = run("gh", [
    "repo",
    "list",
    owner,
    "--limit",
    "300",
    "--json",
    "name,isArchived,isFork,defaultBranchRef",
  ]);
  if (result.status !== 0) throw new Error(`gh repo list failed: ${result.stderr.trim()}`);
  const repos = JSON.parse(result.stdout);
  return repos.map((repo) => ({
    name: repo.name,
    archived: Boolean(repo.isArchived),
    fork: Boolean(repo.isFork),
    branch: repo.defaultBranchRef?.name ?? null,
  }));
}

/** 上游 tag 列表（vX.Y.Z，降序）。失败返回 { error }。 */
function upstreamTags(upstreamUrl) {
  const result = run("git", ["ls-remote", "--tags", "--refs", upstreamUrl]);
  if (result.status !== 0) return { error: `git ls-remote failed: ${(result.stderr || "").trim().split("\n")[0]}` };
  const tags = (result.stdout ?? "")
    .split("\n")
    .map((line) => line.split("\t")[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, ""));
  const sorted = sortedTagsDesc(tags);
  return { tags: sorted, latest: sorted[0] ?? null };
}

/** 读取仓库 default 分支上的一个文件原文。notFound = 文件不存在。 */
function readFileAt(repoSlug, branch, filePath) {
  const result = ghApi(`repos/${repoSlug}/contents/${filePath}?ref=${encodeURIComponent(branch)}`, { raw: true });
  return { ok: result.ok, body: result.ok ? result.body : null, notFound: result.notFound, error: result.ok ? null : result.error };
}

/** 两个 tag 之间 shared/ 的变更摘要。base tag 不存在时回退为 latest 的顶层清单。 */
function changelog(upstreamSlug, current, latest) {
  const compare = ghApi(
    `repos/${upstreamSlug}/compare/v${current}...v${latest}`,
    {
      jq: "{total: .total_commits, titles: [.commits[] | .commit.message | split(\"\\n\")[0]], shared_files: [.files[] | .filename | select(startswith(\"shared/\"))]}",
    },
  );
  if (compare.ok) {
    const parsed = JSON.parse(compare.body);
    return { baseMissing: false, totalCommits: parsed.total ?? parsed.titles.length, titles: parsed.titles ?? [], sharedFiles: parsed.shared_files ?? [] };
  }
  if (compare.notFound) {
    const listing = ghApi(`repos/${upstreamSlug}/contents/shared?ref=v${latest}`, { jq: "[.[].path]" });
    if (listing.ok) {
      return {
        baseMissing: true,
        totalCommits: null,
        titles: [],
        sharedFiles: [],
        latestTopLevel: JSON.parse(listing.body),
      };
    }
    return { baseMissing: true, totalCommits: null, titles: [], sharedFiles: [], latestTopLevel: null, error: listing.error };
  }
  return { baseMissing: false, totalCommits: null, titles: [], sharedFiles: [], error: compare.error };
}

/**
 * 纯分类：给定消费方事实与上游 tag，判定状态。behind 时附带 latest。
 */
function classifyConsumer({ version, diverged, upstream }) {
  if (diverged) return { status: "diverged" };
  if (!version) return { status: "unknown", reason: "src/shared/VERSION 不是合法 semver" };
  if (upstream?.error) return { status: "unknown", reason: `上游 tag 读不到（${upstream.error}）—— 无法判定` };
  const tags = upstream?.tags ?? [];
  if (tags.length === 0) return { status: "unknown", reason: "上游没有任何 vX.Y.Z tag —— 无法判定" };
  const latest = tags[0];
  const comparison = compareVersions(version, latest);
  if (comparison === 0) return { status: "ok", latest };
  if (comparison > 0) return { status: "ahead", latest };
  return { status: "behind", latest };
}

function sliceImpact(sharedFiles) {
  const hits = new Set();
  for (const file of sharedFiles) {
    const slice = file.split("/")[1];
    if (SHARED_SLICES.includes(slice)) hits.add(slice);
  }
  return [...hits];
}

/**
 * 报告结论分流（优先级从高到低）：有落后 > 有无法判定 > 0 消费方 > 全部最新。
 * 「0 消费方」是空扫描，不得与「共享层全部最新」混为一谈——否则 token 失效或
 * owner 改名把扫描面清零时，报告会长得一模一样（BING-48 复审意见）。
 */
function computeVerdict(summary, consumerCount) {
  if (summary.behind > 0) return "has-behind";
  if (summary.unknown > 0) return "has-unknown";
  if (consumerCount === 0) return "no-consumers";
  return "all-clear";
}

function buildTicket({ repo, branch, current, latest, upstreamUrl, upstreamSlug, log }) {
  const title = `${repo} 共享层落后：v${current} → v${latest}`;
  const lines = [];
  lines.push("## 漂移检测（BING-48 autopilot 自动开出）");
  lines.push("");
  lines.push(
    `站点 \`${repo}\`（分支 \`${branch}\`）的 \`src/shared/VERSION\` = **v${current}**，上游 microtools 最新 shared tag = **v${latest}**。本单只跟踪升级，**不自动改代码**——由负责人按协议走正常 PR 流程。`,
  );
  lines.push("");
  lines.push(`### shared/ 变更摘要（v${current} → v${latest}）`);
  lines.push("");
  if (log.baseMissing) {
    lines.push(
      `> 上游不存在 tag \`v${current}\`（版本号可能早于首个 tag 或为手写）——无法做两 tag 对比。以下为 \`v${latest}\` 的 shared/ 顶层内容，供评估影响面：`,
    );
    lines.push("");
    for (const item of log.latestTopLevel ?? []) lines.push(`- ${item}`);
    if (!log.latestTopLevel) lines.push(`- （清单也取不到：${log.error ?? "unknown error"}）`);
  } else if (log.error) {
    lines.push(`> 变更摘要取不到（${log.error}）。升级前先人工看 \`git log v${current}..v${latest} -- shared/\`。`);
  } else if (log.titles.length === 0) {
    lines.push(`（shared/ 在此区间无独立 commit，${log.totalCommits ?? 0} 个 commit 的变更不触及 shared/——升级应无风险。）`);
  } else {
    for (const commitTitle of log.titles) lines.push(`- ${commitTitle}`);
    if (typeof log.totalCommits === "number" && log.totalCommits > log.titles.length) {
      lines.push(`- …（共 ${log.totalCommits} 个 commit，compare API 只回显前 ${log.titles.length} 条）`);
    }
  }
  const slices = sliceImpact(log.sharedFiles);
  if (slices.length > 0) {
    lines.push("");
    lines.push(`### 预计影响面（shared/ 变更文件 ${log.sharedFiles.length} 个）`);
    lines.push("");
    for (const slice of slices) lines.push(`- ${SLICE_IMPACT[slice]}`);
  }
  lines.push("");
  lines.push("### 升级命令");
  lines.push("");
  lines.push("```bash");
  lines.push(`node scripts/sync-shared.mjs --to ${latest}            # 覆盖 src/shared/ + 改 VERSION；自动 build+test，失败自动回滚`);
  lines.push(`node scripts/sync-shared.mjs --to ${latest} --dry-run  # 先看将变更哪些文件，不写盘`);
  lines.push("```");
  lines.push("");
  lines.push("### 验收标准");
  lines.push("");
  lines.push(`- [ ] \`src/shared/VERSION\` = \`${latest}\``);
  lines.push("- [ ] `npm run build` + `npm test` 绿");
  lines.push("- [ ] 走 PR 合并（协议见 microtools `docs/shared-protocol.md`；上游地址 " + (upstreamUrl ?? "?") + "）");
  lines.push("");
  lines.push(`> 上游定位：${upstreamSlug ?? upstreamUrl ?? "?"}。若本站有意不跟随上游，改用 \`src/shared/DIVERGED.md\` 并写明原因与归并计划，然后关闭本单。`);
  return { repo, branch, current, latest, upstreamUrl, upstreamSlug, title, body: lines.join("\n") };
}

// ---------------------------------------------------------------- 报告

function humanReport(report) {
  const lines = [];
  lines.push(`共享层漂移检测 · ${report.generatedAt}`);
  lines.push(`扫描：GitHub ${report.owner}（候选 ${report.scanned} 个仓库，消费方 ${report.consumers.length} 个）`);
  lines.push("");
  const icon = { behind: "← 需开单", diverged: "（有意分叉，跳过）", ahead: "（本地超过最新 tag，不开单）" };
  for (const consumer of report.consumers) {
    const name = consumer.repo.padEnd(24);
    if (consumer.status === "unknown") {
      lines.push(`  无法判定  ${name} v${consumer.version} — ${consumer.reason}`);
    } else if (consumer.status === "behind") {
      lines.push(`  落后      ${name} v${consumer.version} → v${consumer.latest}  ${icon.behind}`);
    } else if (consumer.status === "ok") {
      lines.push(`  最新      ${name} v${consumer.version} = 最新 tag v${consumer.latest}`);
    } else if (consumer.status === "ahead") {
      lines.push(`  超前      ${name} v${consumer.version} > 最新 tag v${consumer.latest}  ${icon.ahead}`);
    } else if (consumer.status === "diverged") {
      lines.push(`  有意分叉  ${name} v${consumer.version}  ${icon.diverged}`);
    }
  }
  lines.push("");
  lines.push(
    `汇总：落后 ${report.summary.behind} · 有意分叉 ${report.summary.diverged} · 无法判定 ${report.summary.unknown} · 最新 ${report.summary.ok} · 超前 ${report.summary.ahead}；建议开单 ${report.tickets.length} 张`,
  );
  if (report.summary.behind > 0) {
    lines.push("结论：存在落后站点 —— 按建议工单开单（每站每版本一张；查重判据=标题全等的开放单）。");
  } else if (report.summary.unknown > 0) {
    lines.push("结论：无落后站点，但有无法判定的仓库 —— 人工确认后处置，不得默认为最新。");
  } else if (report.consumers.length === 0) {
    lines.push("结论：扫描面 0 消费方（尚无站点接入 shared 协议）—— 空扫描≠「全部最新」，同样只在状态板留一行，不开单。");
  } else {
    const latest = report.consumers.find((c) => c.status === "ok")?.latest ?? report.referenceLatest;
    lines.push(`结论：共享层全部最新（v${latest ?? "?"}）—— 只在状态板记一行，不开单。`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- 自检

function selfTest() {
  const assert = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      console.error(`  ✗ ${label}: got ${a}, want ${e}`);
      return false;
    }
    console.log(`  ok    ${label}`);
    return true;
  };
  let pass = true;
  pass = assert("parseVersion 1.2.3", parseVersion("1.2.3")?.raw, "1.2.3") && pass;
  pass = assert("parseVersion v1.2.3-rc.1", parseVersion("v1.2.3-rc.1")?.raw, "1.2.3-rc.1") && pass;
  pass = assert("parseVersion 拒绝垃圾", parseVersion("latest"), null) && pass;
  pass = assert("compare 0.9.0 < 1.0.0", compareVersions("0.9.0", "1.0.0"), -1) && pass;
  pass = assert("compare 相等", compareVersions("1.0.0", "v1.0.0"), 0) && pass;
  pass = assert("compare prerelease < 正式", compareVersions("1.1.0-rc.1", "1.1.0"), -1) && pass;
  pass = assert("tag 排序降序", sortedTagsDesc(["v0.9.0", "v1.0.0", "v1.1.0-rc.1", "v1.0.0"]), ["1.1.0-rc.1", "1.0.0", "0.9.0"]) && pass;
  pass = assert("git url → slug", parseRepoSlugFromGitUrl("https://github.com/li-bing-xin/microtools.git"), "li-bing-xin/microtools") && pass;
  pass =
    assert(
      "分类：behind",
      classifyConsumer({ version: "0.9.0", diverged: false, upstream: { tags: ["1.0.0"] } }).status,
      "behind",
    ) && pass;
  pass =
    assert(
      "分类：diverged 优先（数据再坏也跳过）",
      classifyConsumer({ version: "0.9.0", diverged: true, upstream: { error: "boom" } }).status,
      "diverged",
    ) && pass;
  pass =
    assert(
      "分类：上游读不到 = unknown 而非 ok",
      classifyConsumer({ version: "1.0.0", diverged: false, upstream: { error: "network down" } }).status,
      "unknown",
    ) && pass;
  pass =
    assert("分类：上游无 tag = unknown", classifyConsumer({ version: "1.0.0", diverged: false, upstream: { tags: [] } }).status, "unknown") && pass;
  pass =
    assert("分类：ahead", classifyConsumer({ version: "1.2.0", diverged: false, upstream: { tags: ["1.0.0"] } }).status, "ahead") && pass;
  pass =
    assert(
      "分类：ok",
      classifyConsumer({ version: "1.0.0", diverged: false, upstream: { tags: ["1.0.0", "0.9.0"] } }).latest,
      "1.0.0",
    ) && pass;
  pass = assert("切片归纳", sliceImpact(["shared/seo/sitemap.ts", "shared/render/effects.ts", "bin/other.ts"]), ["seo", "render"]) && pass;
  pass = assert("verdict：落后优先", computeVerdict({ behind: 1, unknown: 1, diverged: 0, ok: 0, ahead: 0 }, 2), "has-behind") && pass;
  pass = assert("verdict：只无法判定", computeVerdict({ behind: 0, unknown: 2, diverged: 0, ok: 0, ahead: 0 }, 1), "has-unknown") && pass;
  pass = assert("verdict：0 消费方 ≠ 全部最新", computeVerdict({ behind: 0, unknown: 0, diverged: 0, ok: 0, ahead: 0 }, 0), "no-consumers") && pass;
  pass = assert("verdict：全清", computeVerdict({ behind: 0, unknown: 0, diverged: 0, ok: 1, ahead: 0 }, 1), "all-clear") && pass;
  const ticket = buildTicket({
    repo: "fixture",
    branch: "main",
    current: "0.9.0",
    latest: "1.0.0",
    upstreamUrl: DEFAULT_UPSTREAM,
    upstreamSlug: "li-bing-xin/microtools",
    log: {
      baseMissing: true,
      totalCommits: null,
      titles: [],
      sharedFiles: [],
      latestTopLevel: ["shared/VERSION", "shared/seo", "shared/render", "shared/scripts"],
    },
  });
  pass = assert("工单标题格式", ticket.title, "fixture 共享层落后：v0.9.0 → v1.0.0") && pass;
  pass = assert("工单含升级命令", ticket.body.includes("node scripts/sync-shared.mjs --to 1.0.0"), true) && pass;
  pass = assert("工单注明 base tag 缺失", ticket.body.includes("上游不存在 tag `v0.9.0`"), true) && pass;
  console.log(pass ? "\n  self-test: 全部通过" : "\n  self-test: 有失败");
  return pass;
}

// ---------------------------------------------------------------- main

const USAGE = `
  node bin/drift-check.mjs [--owner <github-owner>] [--json] [--repo <name>] [--include-archived]
  node bin/drift-check.mjs --self-test

  --owner <o>          扫描该 GitHub owner 下的仓库（默认 li-bing-xin）
  --repo <name>        只扫描指定仓库（调试用）
  --include-archived   连归档仓库也扫（默认跳过——归档 = 退出检测）
  --json               结构化输出：含建议工单（title/body），供 agent 去重后开单
  --self-test          纯函数自检，不出网

退出码：0 正常；1 存在落后站点；2 用法/致命错误。
检测端只读：绝不执行升级；升级由 scripts/sync-shared.mjs --to 走 PR 流程。
`;

function parseArgs(argv) {
  const flags = { owner: "li-bing-xin", json: false, includeArchived: false, repo: null, selfTest: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--include-archived") flags.includeArchived = true;
    else if (arg === "--self-test") flags.selfTest = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--owner") flags.owner = argv[++i];
    else if (arg === "--repo") flags.repo = argv[++i];
    else throw new Error(`unknown flag: ${arg}`);
  }
  return flags;
}

async function main() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n  ${error.message}\n${USAGE}`);
    process.exit(2);
  }
  if (flags.help) {
    console.log(USAGE);
    return;
  }
  if (flags.selfTest) {
    process.exit(selfTest() ? 0 : 1);
  }

  const repos = listRepos(flags.owner).filter((repo) => {
    if (flags.repo && repo.name !== flags.repo) return false;
    if (!flags.includeArchived && repo.archived) return false;
    if (repo.fork) return false;
    if (!repo.branch) return false; // 空仓库
    if (repo.name === DEFAULT_UPSTREAM_REPO) return false; // 上游自身
    return true;
  });

  const consumers = [];
  let scanned = 0;
  const upstreamCache = new Map(); // url -> {tags?, error?}

  for (const repo of repos) {
    scanned += 1;
    const slug = `${flags.owner}/${repo.name}`;
    const versionFile = readFileAt(slug, repo.branch, "src/shared/VERSION");
    if (versionFile.notFound) continue; // 非消费方
    const consumer = { repo: repo.name, branch: repo.branch, version: null, diverged: false, upstreamUrl: null, upstreamSlug: null };
    if (!versionFile.ok) {
      consumers.push({ ...consumer, status: "unknown", reason: `src/shared/VERSION 读不到（${versionFile.error}）` });
      continue;
    }
    const parsed = parseVersion(versionFile.body);
    consumer.version = parsed?.raw ?? String(versionFile.body ?? "").trim();

    const divergedFile = readFileAt(slug, repo.branch, "src/shared/DIVERGED.md");
    consumer.diverged = divergedFile.ok;

    const upstreamFile = readFileAt(slug, repo.branch, ".shared-upstream");
    consumer.upstreamUrl =
      upstreamFile.ok && upstreamFile.body?.trim() ? upstreamFile.body.trim() : upstreamFile.notFound ? DEFAULT_UPSTREAM : null;

    if (!consumer.diverged) {
      if (!consumer.upstreamUrl) {
        consumers.push({ ...consumer, status: "unknown", reason: ".shared-upstream 读不到且无缺省上游可用" });
        continue;
      }
      consumer.upstreamSlug = parseRepoSlugFromGitUrl(consumer.upstreamUrl);
      if (!upstreamCache.has(consumer.upstreamUrl)) {
        upstreamCache.set(consumer.upstreamUrl, upstreamTags(consumer.upstreamUrl));
      }
    }
    const upstream = consumer.diverged ? null : upstreamCache.get(consumer.upstreamUrl);
    consumers.push({ ...consumer, ...classifyConsumer({ version: consumer.version, diverged: consumer.diverged, upstream }) });
  }

  // 缺省上游的最新 tag 也取一份：报告结论行（「全部最新（vX）」）与无消费方场景都要用到
  if (!upstreamCache.has(DEFAULT_UPSTREAM)) {
    upstreamCache.set(DEFAULT_UPSTREAM, upstreamTags(DEFAULT_UPSTREAM));
  }

  // behind 的补变更摘要 + 生成建议工单
  const tickets = [];
  for (const consumer of consumers) {
    if (consumer.status !== "behind") continue;
    const slug = consumer.upstreamSlug ?? parseRepoSlugFromGitUrl(consumer.upstreamUrl);
    consumer.changelog = changelog(slug, consumer.version, consumer.latest);
    tickets.push(
      buildTicket({
        repo: consumer.repo,
        branch: consumer.branch,
        current: consumer.version,
        latest: consumer.latest,
        upstreamUrl: consumer.upstreamUrl,
        upstreamSlug: consumer.upstreamSlug,
        log: consumer.changelog,
      }),
    );
  }

  const summary = { behind: 0, diverged: 0, unknown: 0, ok: 0, ahead: 0 };
  for (const consumer of consumers) summary[consumer.status] += 1;

  const referenceLatest = upstreamCache.get(DEFAULT_UPSTREAM)?.latest ?? null;
  const report = {
    generatedAt: new Date().toISOString(),
    owner: flags.owner,
    scanned,
    referenceLatest,
    verdict: computeVerdict(summary, consumers.length),
    consumers,
    summary,
    tickets,
  };

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(humanReport(report));
  }
  process.exit(summary.behind > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n  ✗ ${error?.message ?? error}\n`);
  process.exit(2);
});
