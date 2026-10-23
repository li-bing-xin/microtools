#!/usr/bin/env node
/**
 * 生成器验收：`bin/create-site.mjs` 产出的站点必须满足「复制 + 版本戳」协议。
 *
 * 对每个模式各生成一个站点到 `.cache/create-site/`，然后断言：
 *  1. `src/shared/` 与上游 `shared/` 逐字节一致（文件集合与内容都相同）；
 *  2. `src/shared/VERSION` 等于 `shared/VERSION`；
 *  3. 站点根有 `.shared-upstream`，且 `scripts/sync-shared.mjs` 入口存在；
 *  4. 模板占位符（__APP_NAME__ / __SITE_NAME__ / __SITE_URL__ / __RENDER_MODE__ /
 *     __BUILD_SCRIPT__ / __NOT_FOUND_HANDLING__ / __CLOUDFLARE_ACCOUNT_ID__）没有残留；
 *  5. 渲染模式落到 `src/lib/site.ts`、`cloudflare.config.ts` 和 build 脚本（软 404 红线）；
 *  6. 站点里没有任何 `@microtools/*` 依赖（共享只走复制）；
 *  7. cf 形态落地：全站 grep 不到 wrangler；CI deploy job 在位（BING-89 B1）；
 *  8. 回灌四项各有落点：link-graph / 打印层（--print off 可关）/ rng / print-fit harness
 *     （BING-89 B2）。
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
  "__NOT_FOUND_HANDLING__",
  "__CLOUDFLARE_ACCOUNT_ID__",
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

function manifest_deploy_uses_cf(target) {
  const manifest = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
  return manifest.scripts.deploy === "cf deploy" && manifest.scripts["deploy:dry-run"] === "cf deploy --dry-run";
}

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

const DUMMY_ACCOUNT_ID = "0".repeat(28) + "face"; // 32 位 hex 占位（只做文本替换，不触 API）

for (const mode of ["spa", "prerender"]) {
  const name = `${mode}-demo`;
  const target = generate(name, [
    "--mode",
    mode,
    "--domain",
    `https://${name}.example.com`,
    "--account-id",
    DUMMY_ACCOUNT_ID,
  ]);
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
    const cfConfig = readFileSync(path.join(target, "cloudflare.config.ts"), "utf8");
    const manifest = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    assert.match(site, new RegExp(`renderMode: RenderMode = "${mode}"`));
    assert.ok(
      cfConfig.includes(mode === "prerender" ? '"404-page"' : '"single-page-application"'),
      "notFoundHandling does not match the mode",
    );
    // 构建链统一从 vite build 走（vite-plugin-postbuild 按模式跑剩余步骤），
    // cf deploy 复用同一条链 —— package.json 不再内联步骤。
    assert.equal(manifest.scripts.build, "vite build");
    // postbuild.mjs 是同一份文件，两个模式的步骤都写死在里面、由 renderMode 分支；
    // 这里校验两条链的步骤齐全（模式落点已在 site.ts / cloudflare.config.ts 断言）。
    const postbuild = readFileSync(path.join(target, "scripts", "postbuild.mjs"), "utf8");
    for (const step of [
      "prerender-marketing.mjs",
      "verify-sitemap-coverage.mjs",
      "relocate-base-path.mjs",
      "verify-render-mode.mjs",
    ]) {
      assert.ok(postbuild.includes(step), `postbuild chain misses ${step}`);
    }
    assert.ok(
      readFileSync(path.join(target, "scripts", "vite-plugin-postbuild.mjs"), "utf8").includes(
        "write-deploy-marker.mjs",
      ),
      "deploy-marker must be written inside the vite build",
    );
  });

  check(`${mode}: cf form — no wrangler in the site's own files`, () => {
    // src/shared/ 不在扫描范围：它必须与上游 shared/ 逐字节一致（BING-47 协议），
    // shared/scripts/relocate-ffmpeg-core.mjs 的历史注释提到的部署工具名只能等
    // shared 下一次发版再清（BING-89 复核记录：仅注释，无功能影响）。
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist") continue;
          if (path.relative(target, abs) === path.join("src", "shared")) continue;
          walk(abs);
        } else if (/\.(tsx?|m?js|jsonc?|md|html|css|ya?ml|txt)$/.test(entry.name) || entry.name === ".gitignore") {
          const source = readFileSync(abs, "utf8");
          if (/wrangler/i.test(source)) offenders.push(path.relative(target, abs));
        }
      }
    };
    walk(target);
    assert.deepEqual(offenders, [], "generated site's own files still mention wrangler");
    assert.equal(existsSync(path.join(target, "cloudflare.config.ts")), true, "missing cloudflare.config.ts");
    assert.equal(manifest_deploy_uses_cf(target), true, "deploy scripts must use cf");
  });

  check(`${mode}: CI deploy job wired (account id, worker name, verify-deploy)`, () => {
    const ci = readFileSync(path.join(target, ".github", "workflows", "ci.yml"), "utf8");
    assert.ok(ci.includes("cf@1.0.0-beta.19 deploy"), "deploy job must run cf deploy");
    assert.ok(ci.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"), "token secret missing");
    assert.ok(ci.includes(`CLOUDFLARE_ACCOUNT_ID: ${DUMMY_ACCOUNT_ID}`), "--account-id was not substituted");
    assert.ok(ci.includes("verify-deploy.mjs"), "deploy-marker check missing");
    assert.ok(ci.includes(`https://${name}.example.com/deploy-marker.txt`), "site url not substituted");
  });

  check(`${mode}: BING-89 backports in place (link-graph / print layer / rng / print-fit)`, () => {
    for (const rel of [
      path.join("src", "lib", "link-graph.ts"),
      path.join("src", "lib", "rng.ts"),
      path.join("src", "components", "PrintDocument.tsx"),
      path.join("src", "styles", "print.css"),
      path.join("tests", "rng.test.ts"),
      path.join("scripts", "verify-print-fit.mjs"),
    ]) {
      assert.ok(existsSync(path.join(target, rel)), `missing ${rel}`);
    }
    const globals = readFileSync(path.join(target, "src", "styles", "globals.css"), "utf8");
    assert.ok(globals.includes('@import "./print.css"'), "print layer not imported");
    assert.ok(
      readFileSync(path.join(target, "src", "routes", "root.tsx"), "utf8").includes("TOOL_LINKS"),
      "footer must render from link-graph",
    );
  });

  check(`${mode}: no stale dirs copied (dist/node_modules/public marker)`, () => {
    for (const rel of ["node_modules", "dist", ".wrangler", path.join("public", "deploy-marker.txt")]) {
      assert.equal(existsSync(path.join(target, rel)), false, `unexpected ${rel}`);
    }
    assert.ok(statSync(path.join(target, "src", "shared", "scripts", "sync-shared.mjs")).isFile());
  });
}

// --print off：生成时不带打印层，且不残留（组件、样式、import 行都消失）。
{
  const name = "spa-print-off-demo";
  const target = generate(name, [
    "--mode",
    "spa",
    "--domain",
    `https://${name}.example.com`,
    "--print",
    "off",
    "--account-id",
    DUMMY_ACCOUNT_ID,
  ]);
  console.log(`\n  spa + --print off -> ${path.relative(root, target)}\n`);

  check("print off: no print layer files", () => {
    for (const rel of [
      path.join("src", "components", "PrintDocument.tsx"),
      path.join("src", "styles", "print.css"),
    ]) {
      assert.equal(existsSync(path.join(target, rel)), false, `unexpected ${rel}`);
    }
    const globals = readFileSync(path.join(target, "src", "styles", "globals.css"), "utf8");
    assert.ok(!globals.includes("./print.css"), "globals.css still imports print.css");
  });

  check("print off: rest of the site intact", () => {
    assert.ok(existsSync(path.join(target, "src", "lib", "link-graph.ts")), "link-graph must stay");
    assert.ok(existsSync(path.join(target, "src", "lib", "rng.ts")), "rng must stay");
    assert.ok(existsSync(path.join(target, "cloudflare.config.ts")), "cf config must stay");
  });
}

rmSync(cacheDir, { recursive: true, force: true });

console.log(`\n  create-site: ${checks} checks, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
