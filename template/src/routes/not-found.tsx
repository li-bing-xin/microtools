import { Link } from "@tanstack/react-router";
import { usePageHead } from "@/lib/head";
import type { PageDefinition } from "@/lib/pages";

/**
 * 客户端专用页面示例：**故意不**放进 src/lib/pages.ts 的预渲染清单。
 *
 * - 预渲染模式：直接访问不存在的 URL 由 Workers 的 404-page 返回真 404；
 *   站内导航到未知路径时由这个组件兜底。私有路由（/app/...）也可以照这个方式
 *   留在 SPA 侧：只挂路由，不进 pages.ts。
 * - SPA 模式：未知路径由 single-page-application 回退到 index.html，再由这个组件渲染。
 */
const notFoundPage: PageDefinition = {
  path: "/404",
  title: "Page Not Found",
  description: "The page you requested does not exist.",
  live: false,
  sitemap: { priority: 0, changeFrequency: "yearly" },
};

export function NotFoundPage() {
  usePageHead(notFoundPage);

  return (
    <>
      <h1>Page not found</h1>
      <p className="lede">
        That URL does not exist. If you followed a link from inside the app, the page may have moved.
      </p>
      <p>
        <Link to="/">Back to the tool</Link>
      </p>
    </>
  );
}
