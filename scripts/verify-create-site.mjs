#!/usr/bin/env node
/**
 * 生成器验收：`bin/create-site.mjs` 产出的站点必须满足「复制 + 版本戳」协议。
 *
 * 对每个模式各生成一个站点到 `.cache/create-site/`，然后断言：
 *  1. `src/shared/` 与上游 `shared/` 逐字节一致（文件集合与内容都相同）；
 *  2. `src/shared/VERSION` 等于 `shared/VERSION`；
 *  3. 站点根有 `.shared-upstream`，且 `scripts/sync-shared.mjs` 入口存在；
 *  4. 模板占位符（__APP_NAME__ / __SITE_NAME__ / __SITE_URL__ / __RENDER_MODE__ /
 *     __BUILD_SCRIPT__ / __NOT_FOUND_HANDLING__）没有残留；
 *  5. 渲染模式落到 `src/lib/site.ts`、`wrangler.jsonc` 和 build 脚本（软 404 红线）；
 *  6. 站点里没有任何 `@microtools/*` 依赖（共享只走复制）。
 *
 * 不装依赖、不跑站点构建 —— 那是站点自己的 CI；这里只验收「生成物正确」。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache", "create-site");
const sharedDir = path.join(root, "shared");
const PLACEHOLDERS = [
  "__APP_NAME__",
  "__SITE_NAME__",
  "__SITE_URL__",
  "__RENDER_MODE__",
  "__BUILD_SCRIPT__",
  "__NOT_FOUND_HANDLING__",
];

let checks = 0;
const failures = [];

function check(label, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok    ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL  ${label} — ${error.message}`);
  }
}

function listFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(abs, base));
    else if (entry.isFile()) files.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return files.sort();
}

const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function generate(name, args) {
  const target = path.join(cacheDir, name);
  rmSync(target, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [path.join(root, "bin", "create-site.mjs"), name, "--out", target, ...args],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `create-site failed:\n${result.stdout}\n${result.stderr}`);
  return target;
}

rmSync(cacheDir, { recursive: true, force: true });

for (const mode of ["spa", "prerender"]) {
  const name = `${mode}-demo`;
  const target = generate(name, ["--mode", mode, "--domain", `https://${name}.example.com`]);
  console.log(`\n  ${mode} -> ${path.relative(root, target)}\n`);

  check(`${mode}: src/shared is byte-identical to shared/`, () => {
    const upstream = listFiles(sharedDir);
    const copied = listFiles(path.join(target, "src", "shared"));
    assert.deepEqual(copied, upstream, "file set differs");
    for (const rel of upstream) {
      assert.equal(
        digest(path.join(target, "src", "shared", rel)),
        digest(path.join(sharedDir, rel)),
        `content differs: ${rel}`,
      );
    }
  });

  check(`${mode}: src/shared/VERSION matches shared/VERSION`, () => {
    assert.equal(
      readFileSync(path.join(target, "src", "shared", "VERSION"), "utf8").trim(),
      readFileSync(path.join(sharedDir, "VERSION"), "utf8").trim(),
    );
  });

  check(`${mode}: sync entrypoints present`, () => {
    assert.ok(existsSync(path.join(target, "scripts", "sync-shared.mjs")), "missing scripts/sync-shared.mjs");
    assert.ok(existsSync(path.join(target, ".shared-upstream")), "missing .shared-upstream");
    assert.ok(existsSync(path.join(target, "scripts", "verify-shared.mjs")), "missing npm test script");
  });

  check(`${mode}: no template placeholders left`, () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist") continue;
          walk(abs);
        } else if (/\.(tsx?|m?js|jsonc?|md|html|css|ya?ml|txt)$/.test(entry.name) || entry.name === ".gitignore") {
          const source = readFileSync(abs, "utf8");
          for (const token of PLACEHOLDERS) {
            if (source.includes(token)) offenders.push(`${path.relative(target, abs)}: ${token}`);
          }
        }
      }
    };
    walk(target);
    assert.deepEqual(offenders, [], offenders.join("\n"));
  });

  check(`${mode}: no @microtools/* dependency`, () => {
    const manifest = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    assert.deepEqual(deps.filter((dep) => dep.startsWith("@microtools/")), []);
  });

  check(`${mode}: render mode is wired through`, () => {
    const site = readFileSync(path.join(target, "src", "lib", "site.ts"), "utf8");
    const wrangler = readFileSync(path.join(target, "wrangler.jsonc"), "utf8");
    const manifest = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    assert.match(site, new RegExp(`renderMode: RenderMode = "${mode}"`));
    assert.ok(
      wrangler.includes(mode === "prerender" ? '"404-page"' : '"single-page-application"'),
      "not_found_handling does not match the mode",
    );
    if (mode === "prerender") {
      assert.ok(manifest.scripts.build.includes("prerender-marketing.mjs"));
      assert.ok(manifest.scripts.build.includes("verify-sitemap-coverage.mjs"));
    } else {
      assert.ok(!manifest.scripts.build.includes("prerender-marketing.mjs"));
    }
    assert.ok(manifest.scripts.build.includes("src/shared/scripts/write-deploy-marker.mjs"));
  });

  check(`${mode}: no stale dirs copied (dist/node_modules/public marker)`, () => {
    for (const rel of ["node_modules", "dist", ".wrangler", path.join("public", "deploy-marker.txt")]) {
      assert.equal(existsSync(path.join(target, rel)), false, `unexpected ${rel}`);
    }
    assert.ok(statSync(path.join(target, "src", "shared", "scripts", "sync-shared.mjs")).isFile());
  });
}

rmSync(cacheDir, { recursive: true, force: true });

console.log(`\n  create-site: ${checks} checks, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
