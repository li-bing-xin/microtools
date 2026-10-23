/**
 * Worker 运行时入口（占位壳）。
 *
 * 模板站是纯静态资产：页面请求由 Workers Static Assets 直出
 * （cloudflare.config.ts 的 assets 配置），这个入口只是 @cloudflare/vite-plugin
 * 要求的 Worker 壳——不处理业务，也零依赖。
 *
 * 站点真要 API 时在这里加处理函数（`runWorkerFirst` 圈前缀，参考 printable-studio
 * 的 /api/* + D1 形态）；新增运行时依赖要单独拍板。
 */
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
