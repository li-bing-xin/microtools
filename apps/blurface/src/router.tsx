import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { NotFoundPage } from "@/routes/not-found";
import { PageView } from "@/routes/page";
import { RootLayout } from "@/routes/root";
import { pages, type PageDefinition } from "@/lib/pages";
import { site } from "@/lib/site";

/**
 * 路由采用 code-based 写法（不是 file-based）：不引入 @tanstack/router-plugin，
 * 路由树就是普通 TS，可被 tsc 完整检查。
 *
 * 15 条公开路由与 `src/lib/pages.ts` 的预渲染清单**同源**：清单加一条，路由自动多一条，
 * 不会出现「预渲染了但没有路由」或「有路由但没预渲染」。清单外的路径由 notFoundComponent
 * 兜底（预渲染模式下真实访问由 Workers 的 404-page 返回真 404）。
 */
const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

/** 把一个 PageDefinition 变成路由组件；各页正文在 P1/P2 按类型接管。 */
function pageRoute(page: PageDefinition) {
  function Page() {
    return <PageView page={page} />;
  }
  return createRoute({
    getParentRoute: () => rootRoute,
    path: page.path,
    component: Page,
  });
}

const routeTree = rootRoute.addChildren(pages.map(pageRoute));

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
