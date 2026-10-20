#!/usr/bin/env node
/**
 * 站点的 `npm test`：守住「共享只走复制」这条边界。
 *
 * 断言（全部离线，不访问上游）：
 *  1. src/shared/VERSION 是合法 semver；
 *  2. src/shared 的切片入口齐全（seo / render / scripts/sync-shared.mjs / README）；
 *  3. src/ 下没有任何 `@microtools/*` 导入，package.json 也没有这类依赖
 *     —— 共享代码只能以 src/shared/ 的源码形式存在，不走包依赖；
 *  4. 存在 src/shared/DIVERGED.md 时明确提示（有意分叉，sync-shared 会跳过/拒绝）。
 *
 * 需要升级 shared 时用 `node scripts/sync-shared.mjs --check` / `--to <version>`，
 * 不要手改 src/shared/。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedDir = path.join(siteRoot, "src", "shared");
const failures = [];
let checks = 0;

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

function listSourceFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else if (/\.(ts|tsx|mjs|js|json)$/.test(entry.name)) files.push(abs);
  }
  return files;
}

check("src/shared/VERSION is semver", () => {
  const file = path.join(sharedDir, "VERSION");
  if (!existsSync(file)) throw new Error("missing src/shared/VERSION");
  const version = readFileSync(file, "utf8").trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`not semver: "${version}"`);
});

for (const entry of ["README.md", "seo/index.ts", "render/index.ts", "scripts/sync-shared.mjs"]) {
  check(`src/shared/${entry} exists`, () => {
    if (!existsSync(path.join(sharedDir, entry))) throw new Error(`missing src/shared/${entry}`);
  });
}

check("no @microtools/* imports in src/", () => {
  const offenders = listSourceFiles(path.join(siteRoot, "src")).filter((file) =>
    /@microtools\//.test(readFileSync(file, "utf8")),
  );
  if (offenders.length > 0) {
    throw new Error(
      `shared code must be copied into src/shared, not imported as a package: ${offenders
        .map((file) => path.relative(siteRoot, file))
        .join(", ")}`,
    );
  }
});

check("package.json has no @microtools/* dependency", () => {
  const manifest = JSON.parse(readFileSync(path.join(siteRoot, "package.json"), "utf8"));
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  const offenders = Object.keys(deps).filter((name) => name.startsWith("@microtools/"));
  if (offenders.length > 0) throw new Error(`remove: ${offenders.join(", ")}`);
});

if (existsSync(path.join(sharedDir, "DIVERGED.md"))) {
  console.log("  ·     src/shared/DIVERGED.md present — this site intentionally diverged; sync-shared will skip/refuse");
}

console.log(`\n  shared ${readFileSync(path.join(sharedDir, "VERSION"), "utf8").trim()} — ${checks} checks, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
