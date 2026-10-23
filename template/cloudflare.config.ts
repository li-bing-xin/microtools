import { defineConfig } from "cf/config";

/**
 * cf 项目配置（`cf deploy` 读取本文件；站点仓库里只有这一份部署配置）。
 *
 * 形态与 printable-studio 一致：@cloudflare/vite-plugin 构建 → Build Output，
 * 静态资源由 Workers Static Assets 直出，src/worker/index.ts 是插件要求的 Worker 壳。
 *
 * - htmlHandling 用 auto-trailing-slash：/privacy 与 /privacy/ 都由 privacy/index.html 提供；
 * - notFoundHandling 由 create-site 按 --mode 写入：
 *   - spa（默认）：single-page-application —— 未知路径回退 index.html，客户端路由接管；
 *   - prerender：404-page —— 未知路径保持真 404。红线：预渲染站绝不能配 SPA 回退，
 *     否则任意 URL 都返回 200，变成软 404。scripts/verify-render-mode.mjs 在构建的
 *     最后一步校验模式与本文件一致，配错直接非零退出。
 *
 * Worker 名 = worker.name（create-site 按 --name 参数写入；改名就改这里）。
 * 自定义域名 / route 属于 playbook gate 3：先拍板，再在 Cloudflare 侧绑定，
 * 并把 src/lib/site.ts 的 site.url 改成最终域名。
 */
export default defineConfig({
	worker: {
		name: "__APP_NAME__",
		compatibilityDate: "2026-10-01",
		entrypoint: "src/worker/index.ts",
		observability: {
			enabled: true,
		},
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "__NOT_FOUND_HANDLING__",
		},
	},
});
