import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { HomePage } from "@/routes/home";
import { PrivacyPage } from "@/routes/privacy";
import { RootLayout } from "@/routes/root";
import { TermsPage } from "@/routes/terms";
import { site } from "@/lib/site";

/**
 * 路由采用 code-based 写法（不是 file-based）：
 * - 不额外引入 @tanstack/router-plugin / 生成文件，路由树就是普通 TS，可被 tsc 完整检查；
 * - 路由数量少的工具站（首页 + 法务页）用不到 file-based 的目录约定。
 * 页面变多、需要按目录自动生成时再迁移，routeTree 的形状不变。
 */
const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

const routeTree = rootRoute.addChildren([homeRoute, privacyRoute, termsRoute]);

/** 服务端渲染传 memory history；浏览器里不传，用默认 browser history。 */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    basepath: site.basePath === "/" ? undefined : site.basePath.replace(/\/$/, ""),
    defaultPreload: "intent",
    ...(history ? { history } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
