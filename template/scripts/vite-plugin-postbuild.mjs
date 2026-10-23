/**
 * 把预渲染接进 Vite 客户端构建的 closeBundle。
 *
 * 为什么不是 package.json 里串 `&&`：`cf deploy` 由 @cloudflare/vite-plugin 直接调用
 * `vite build`，不会跑 npm script；只有把后处理挂到 Vite 生命周期里，`npm run build`
 * 和 `cf deploy` 才会得到同一份产物（预渲染 HTML + sitemap + 三项校验）。
 *
 * 只在 client 环境执行一次；worker 环境的产物是 bundle，不是静态资源。
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function postbuildPlugin() {
  let outDir = null;
  let markerWritten = false;

  return {
    name: "microtools-template-postbuild",
    apply: "build",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      // 先写 public/deploy-marker.txt，Vite 会在构建结束时把它复制进产物。
      // 放在这里而不是 npm script 里：`cf deploy` 直接调 vite build，不会跑 npm build，
      // CI 里也就没有「上一次构建留下的 marker」可用。
      if (markerWritten) return;
      markerWritten = true;
      const result = spawnSync(process.execPath, ["src/shared/scripts/write-deploy-marker.mjs"], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      });
      if (result.status !== 0) {
        throw new Error(`deploy-marker failed (exit ${result.status ?? "signal"})`);
      }
    },
    closeBundle() {
      // 客户端环境的 outDir 由 @cloudflare/vite-plugin 在 configEnvironment 里改写成
      // Build Output 的 assets 目录，根 configResolved 拿到的是 Vite 默认值；这里以
      // 当前 environment 的实际配置为准。
      const environmentOutDir = this.environment?.config?.build?.outDir;
      const target = resolve(process.cwd(), environmentOutDir ?? outDir ?? "");
      if (!target) throw new Error("postbuild: build.outDir was not resolved");
      console.log(`\n[postbuild] prerendering into ${target}`);
      const result = spawnSync(process.execPath, ["scripts/postbuild.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, SITE_DIST_DIR: target },
        stdio: "inherit",
      });
      if (result.status !== 0) {
        throw new Error(`postbuild failed (exit ${result.status ?? "signal"})`);
      }
    },
  };
}
