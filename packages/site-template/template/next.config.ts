import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 工具站全静态：无服务端运行时，处理全部发生在浏览器。
  trailingSlash: false,
  poweredByHeader: false,
  images: {
    // 图片一律静态直出；不要在 Cloudflare/Workers 上启用 next/image 优化器
    // （BING-16/17：优化器端点 500 会让全站裂图）。
    unoptimized: true,
  },
};

export default nextConfig;
