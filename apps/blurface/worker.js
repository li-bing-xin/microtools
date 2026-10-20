/**
 * blurface Worker —— 三条职责：
 *
 * 1. `/ffmpeg/core/ffmpeg-core.wasm`（30.7 MiB）超过 Workers Static Assets 的
 *    25 MiB 单文件上限（wrangler deploy / dev 实测硬拒绝，2026-10-19），所以
 *    构建后由 scripts/relocate-ffmpeg-core.mjs 把它搬出 out/，改存 R2
 *    （binding: CORE_WASM，bucket: blurface-assets，key: ffmpeg-core.wasm），
 *    由本 Worker 原样回源。该文件版本由 package-lock 锁定、内容不变 → immutable。
 *
 * 2. `/models/ort/ort-wasm.wasm`：ONNX Runtime Web 的 CPU wasm 未压缩是 9.3 MiB。
 *    Workers Static Assets 默认不压缩静态文件，浏览器实收就是 9.3 MiB；加上
 *    4.7 MiB 车牌模型，懒加载首包会超过 10 MB 预算（BING-29）。构建脚本
 *    scripts/compress-ort-wasm.mjs 把 out/ 里的 wasm 换成 `.wasm.gz`（约 2.5 MiB），
 *    本 Worker 用 `Content-Encoding: gzip` 回源，浏览器/ORT 仍然按普通
 *    `ort-wasm.wasm` URL 取，传输量降到约 2.5 MiB。
 *
 * 3. 其余所有请求透传给 Static Assets（html_handling / not_found_handling /
 *    _headers 全部由 ASSETS.fetch 内部处理，行为与纯静态部署一致）。
 *
 * ffmpeg 版本变更时需要重新上传一次 R2（CI 不上传，见 README 部署一节）：
 *   npx wrangler r2 object put blurface-assets/ffmpeg-core.wasm \
 *     --file .ffmpeg-core/ffmpeg-core.wasm --content-type application/wasm --remote
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/ffmpeg/core/ffmpeg-core.wasm") {
      const obj = await env.CORE_WASM.get("ffmpeg-core.wasm", {
        onlyIf: request.headers.get("if-none-match"),
      });
      if (obj === null) {
        return new Response("ffmpeg core not uploaded to R2 yet\n", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      // 命中 If-None-Match 时 R2 返回不带可用 body 的对象
      if (!obj.body || obj.bodyUsed) {
        return new Response(null, { status: 304, headers: { etag: obj.httpEtag } });
      }
      const headers = new Headers();
      obj.writeHttpMetadata(headers); // content-type: application/wasm（上传时指定）
      headers.set("etag", obj.httpEtag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers });
    }

    if (pathname === "/models/ort/ort-wasm.wasm") {
      // Serve the pre-compressed asset under the URL ORT asks for. `identity`
      // keeps the platform from transparently decompressing the .gz file.
      const gzUrl = new URL("/models/ort/ort-wasm.wasm.gz", url);
      const gz = await env.ASSETS.fetch(
        new Request(gzUrl, { headers: { "accept-encoding": "identity" } }),
      );
      if (gz.status === 200 && gz.body) {
        return new Response(gz.body, {
          headers: {
            "content-type": "application/wasm",
            "content-encoding": "gzip",
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            "vary": "accept-encoding",
          },
        });
      }
      // Fall through when a checkout still ships the uncompressed file (dev),
      // so the route never makes auto-detect worse than a plain static host.
      return env.ASSETS.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
