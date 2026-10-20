#!/usr/bin/env node
/**
 * 部署校验（BING-37）：确认某个 commit 真的上线了，而不是"合并了就算上线"。
 *
 * 拉 https://blurface.dev/deploy-marker.txt（prebuild 生成，内容含构建时的 git sha），
 * 轮询到 git_sha 与本 commit 匹配为止；超时仍不匹配则非零退出，并报出线上实际 sha。
 *
 *   node scripts/verify-deploy.mjs 083b22b
 *   node scripts/verify-deploy.mjs 083b22b --timeout 120 --interval 10
 *   node scripts/verify-deploy.mjs 083b22b --json   # 给 BING-26 状态板等机器调用
 *
 * 默认：10 分钟超时、30 秒轮询。退出码：0 已上线 / 1 超时未上线 / 2 参数错误。
 * 支持完整 sha 或 >=7 位短 sha（marker 里是完整 sha，前缀匹配）。
 */

const DEFAULT_URL = "https://blurface.dev/deploy-marker.txt";
const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_INTERVAL_SEC = 30;
const REQUEST_TIMEOUT_MS = 15_000;

const EXIT_LIVE = 0;
const EXIT_NOT_LIVE = 1;
const EXIT_USAGE = 2;

function die(message) {
  console.error(`[verify-deploy] ${message}`);
  console.error(
    "usage: node scripts/verify-deploy.mjs <sha> [--timeout <seconds>] [--interval <seconds>] [--url <marker-url>] [--json]",
  );
  process.exit(EXIT_USAGE);
}

function parseArgs(argv) {
  const opts = {
    sha: null,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    intervalSec: DEFAULT_INTERVAL_SEC,
    url: DEFAULT_URL,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: node scripts/verify-deploy.mjs <sha> [--timeout <seconds>] [--interval <seconds>] [--url <marker-url>] [--json]",
      );
      process.exit(EXIT_LIVE);
    }
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--timeout" || arg === "--interval" || arg === "--url") {
      const value = argv[i + 1];
      if (value === undefined) die(`${arg} needs a value`);
      i += 1;
      if (arg === "--url") {
        try {
          const parsed = new URL(value);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            die(`--url must be http(s): ${value}`);
          }
        } catch {
          die(`--url is not a valid URL: ${value}`);
        }
        opts.url = value;
      } else {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) die(`${arg} must be a positive number`);
        if (arg === "--timeout") opts.timeoutSec = seconds;
        else opts.intervalSec = seconds;
      }
      continue;
    }
    if (arg.startsWith("-")) die(`unknown option: ${arg}`);
    if (opts.sha !== null) die(`unexpected extra argument: ${arg}`);
    opts.sha = arg;
  }

  if (opts.sha === null) die("missing commit sha");
  if (!/^[0-9a-f]{7,40}$/i.test(opts.sha)) die(`not a git sha (want 7-40 hex chars): ${opts.sha}`);

  return opts;
}

function log(message) {
  console.error(`[verify-deploy] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMarker(text) {
  const fields = {};
  for (const line of text.split("\n")) {
    const match = /^([a-z_]+)=(.*)$/.exec(line.trim());
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

async function fetchMarker(url) {
  const target = new URL(url);
  // 绕过 CDN / 浏览器缓存：marker 每次部署都会变，但 URL 不变。
  target.searchParams.set("_", String(Date.now()));
  const response = await fetch(target, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseMarker(await response.text());
}

function shaMatches(expected, live) {
  if (!live || !/^[0-9a-f]{7,40}$/i.test(live)) return false;
  const want = expected.toLowerCase();
  const got = live.toLowerCase();
  return want.startsWith(got) || got.startsWith(want);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const deadline = startedAt + opts.timeoutSec * 1000;

  log(
    `waiting for ${opts.sha} on ${opts.url} (timeout ${opts.timeoutSec}s, interval ${opts.intervalSec}s)`,
  );

  let attempts = 0;
  let liveSha = null;
  let releasedAt = null;
  let lastError = null;

  for (;;) {
    attempts += 1;
    const checkedAt = new Date().toISOString();
    try {
      const marker = await fetchMarker(opts.url);
      liveSha = marker.git_sha ?? null;
      releasedAt = marker.released_at_utc ?? null;
      lastError = null;

      if (shaMatches(opts.sha, liveSha)) {
        const elapsedMs = Date.now() - startedAt;
        log(
          `live: git_sha=${liveSha} released_at_utc=${releasedAt ?? "unknown"} (attempt ${attempts}, ${(elapsedMs / 1000).toFixed(1)}s)`,
        );
        if (opts.json) {
          console.log(
            JSON.stringify({
              ok: true,
              expected_sha: opts.sha,
              live_sha: liveSha,
              released_at_utc: releasedAt,
              url: opts.url,
              attempts,
              elapsed_ms: elapsedMs,
            }),
          );
        } else {
          console.log(
            `[verify-deploy] OK ${opts.sha} is live (git_sha=${liveSha} released_at_utc=${releasedAt ?? "unknown"})`,
          );
        }
        process.exit(EXIT_LIVE);
      }
      log(
        `attempt ${attempts} at ${checkedAt}: live git_sha=${liveSha ?? "unknown"} released_at_utc=${releasedAt ?? "unknown"} — not yet`,
      );
    } catch (error) {
      lastError = error;
      log(`attempt ${attempts} at ${checkedAt}: fetch failed (${error.message}) — retrying`);
    }

    if (Date.now() >= deadline) break;
    const waitMs = Math.min(opts.intervalSec * 1000, deadline - Date.now());
    await sleep(waitMs);
  }

  const elapsedMs = Date.now() - startedAt;
  const detail = liveSha
    ? `live git_sha=${liveSha} released_at_utc=${releasedAt ?? "unknown"}`
    : `could not read a live sha${lastError ? ` (${lastError.message})` : ""}`;
  log(
    `NOT live: expected git_sha=${opts.sha}, ${detail} (${attempts} attempts, ${(elapsedMs / 1000).toFixed(1)}s)`,
  );

  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: false,
        expected_sha: opts.sha,
        live_sha: liveSha,
        released_at_utc: releasedAt,
        url: opts.url,
        attempts,
        elapsed_ms: elapsedMs,
        error: liveSha ? "sha_mismatch" : (lastError?.message ?? "no_marker"),
      }),
    );
  }

  process.exit(EXIT_NOT_LIVE);
}

main().catch((error) => {
  console.error(`[verify-deploy] unexpected error: ${error.stack ?? error.message}`);
  process.exit(EXIT_NOT_LIVE);
});
