#!/usr/bin/env node
/**
 * 部署校验：确认某个 commit 真的上线了，而不是「合并了就算上线」。
 *
 * 轮询 <site>/deploy-marker.txt（构建期由 write-deploy-marker.mjs 写入 git sha），
 * 直到线上 sha 与目标一致；超时仍不一致则非零退出，并打印线上实际 sha。
 *
 *   node scripts/verify-deploy.mjs 083b22b --url https://example.com/deploy-marker.txt
 *   node scripts/verify-deploy.mjs 083b22b --url ... --timeout 120 --interval 10
 *
 * 退出码：0 已上线 / 1 超时未上线 / 2 参数错误。支持 >= 7 位短 sha。
 */
const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_INTERVAL_SEC = 30;
const REQUEST_TIMEOUT_MS = 15_000;

function usage(message) {
  if (message) console.error(`[verify-deploy] ${message}`);
  console.error(
    "usage: node scripts/verify-deploy.mjs <sha> --url <marker-url> [--timeout <seconds>] [--interval <seconds>]",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    sha: null,
    url: null,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    intervalSec: DEFAULT_INTERVAL_SEC,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url" || arg === "--timeout" || arg === "--interval") {
      const value = argv[index + 1];
      if (value === undefined) usage(`${arg} needs a value`);
      index += 1;
      if (arg === "--url") {
        try {
          new URL(value);
        } catch {
          usage(`--url is not a valid URL: ${value}`);
        }
        options.url = value;
      } else {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) usage(`${arg} must be a positive number`);
        if (arg === "--timeout") options.timeoutSec = seconds;
        else options.intervalSec = seconds;
      }
      continue;
    }
    if (arg.startsWith("-")) usage(`unknown option: ${arg}`);
    if (options.sha !== null) usage(`unexpected extra argument: ${arg}`);
    options.sha = arg;
  }

  if (options.sha === null) usage("missing commit sha");
  if (!/^[0-9a-f]{7,40}$/i.test(options.sha)) usage(`not a git sha: ${options.sha}`);
  if (options.url === null) usage("--url is required (e.g. https://example.com/deploy-marker.txt)");

  return options;
}

function parseMarker(text) {
  const fields = {};
  for (const line of text.split("\n")) {
    const match = /^([a-z_]+)=(.*)$/.exec(line.trim());
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

function shaMatches(expected, live) {
  if (!live || !/^[0-9a-f]{7,40}$/i.test(live)) return false;
  return expected.toLowerCase().startsWith(live.toLowerCase()) || live.toLowerCase().startsWith(expected.toLowerCase());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const options = parseArgs(process.argv.slice(2));
const deadline = Date.now() + options.timeoutSec * 1000;
let attempts = 0;
let lastLiveSha = null;
let lastError = null;

console.error(
  `[verify-deploy] waiting for ${options.sha} on ${options.url} (timeout ${options.timeoutSec}s, interval ${options.intervalSec}s)`,
);

for (;;) {
  attempts += 1;
  try {
    const target = new URL(options.url);
    target.searchParams.set("_", String(Date.now()));
    const response = await fetch(target, {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const marker = parseMarker(await response.text());
    lastLiveSha = marker.git_sha ?? null;
    lastError = null;

    if (shaMatches(options.sha, lastLiveSha)) {
      console.log(
        `[verify-deploy] OK ${options.sha} is live (git_sha=${lastLiveSha} released_at_utc=${marker.released_at_utc ?? "unknown"}, ${attempts} attempt(s))`,
      );
      process.exit(0);
    }
    console.error(
      `[verify-deploy] attempt ${attempts}: live git_sha=${lastLiveSha ?? "unknown"} — not yet`,
    );
  } catch (error) {
    lastError = error;
    console.error(`[verify-deploy] attempt ${attempts}: fetch failed (${error.message}) — retrying`);
  }

  if (Date.now() >= deadline) break;
  await sleep(Math.min(options.intervalSec * 1000, deadline - Date.now()));
}

console.error(
  `[verify-deploy] NOT live: expected ${options.sha}, got ${lastLiveSha ?? `no marker${lastError ? ` (${lastError.message})` : ""}`} after ${attempts} attempt(s)`,
);
process.exit(1);
