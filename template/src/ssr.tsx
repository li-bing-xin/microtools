import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { buildHead, renderHeadHtml, type HeadData } from "@/lib/head";
import { buildSeoFiles, getPage, outputPathFor, pages, type PageDefinition } from "@/lib/pages";
import { createQueryClient } from "@/lib/query";
import { site } from "@/lib/site";
import { createAppRouter } from "@/router";

/**
 * 预渲染入口：被 scripts/lib/ssr-bundle.mjs 用 esbuild 打成 Node 可执行的 CJS。
 * 只输出 #root 的内容；文档壳、head、资源标签由 scripts/prerender-marketing.mjs 拼。
 *
 * memory history 的位置要带 basepath：router 会自己剥掉 basepath 再匹配路由。
 * basePath 为 "/" 时就是普通路径。
 */
function routerLocationFor(path: string): string {
  if (site.basePath === "/") return path;
  const base = site.basePath.replace(/\/$/, "");
  return `${base}${path === "/" ? "/" : path}`;
}

export async function renderPage(path: string): Promise<string> {
  getPage(path); // 未知路径直接报错，不要静默渲染成首页
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [routerLocationFor(path)] }),
  );
  await router.load();

  return renderToString(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

export interface PrerenderPage {
  path: string;
  outputPath: string;
  live: boolean;
  sitemap: PageDefinition["sitemap"];
  head: HeadData;
}

export interface PrerenderManifest {
  site: {
    url: string;
    name: string;
    lang: string;
    basePath: string;
  };
  pages: PrerenderPage[];
}

/** 预渲染脚本和两个 SEO 校验脚本共用这份清单（单一真源）。 */
export function getPrerenderManifest(): PrerenderManifest {
  return {
    site: {
      url: site.url,
      name: site.name,
      lang: site.lang,
      basePath: site.basePath,
    },
    pages: pages.map((page) => ({
      path: page.path,
      outputPath: outputPathFor(page.path),
      live: page.live,
      sitemap: page.sitemap,
      head: buildHead(page),
    })),
  };
}

/**
 * 构建期写盘的 sitemap.xml / robots.txt 内容。
 *
 * 脚本（.mjs）不直接 import TS 切片：由这里把 shared/seo 的结果算好交出去，
 * 保证「哪些页面进 sitemap」只有 src/lib/pages.ts 一份实现。
 */
export function getSeoFiles(): { sitemap: string; robots: string } {
  return buildSeoFiles(
    { url: site.url, name: site.name, locale: "en_US" },
  );
}

export { renderHeadHtml };
export type { HeadData };
