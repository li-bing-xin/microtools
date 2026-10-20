import { useEffect } from "react";
import { buildPageMetadata, type JsonLd } from "@/shared/seo";
import type { PageDefinition } from "./pages";
import { renderMode, siteConfig } from "./site";

/**
 * 页面 head 的单一真源：构建期由 prerender 写进静态 HTML，运行时由 usePageHead
 * 在客户端导航后同步。两边都走 buildHead，不会出现「静态 HTML 的 title 和
 * SPA 导航后的 title 不一致」。
 *
 * 不使用 TanStack 的 route `head` + HeadContent：那套方案要求把整份 document
 * 放进 React 树做 hydration，静态站里为了 head 付这个代价不值。等真的需要
 * 流式 SSR / per-route styles 时再换。
 */
export interface HeadData {
  title: string;
  meta: Array<{ name?: string; property?: string; content: string }>;
  links: Array<{ rel: string; href: string }>;
  jsonLd?: JsonLd;
}

export function buildHead(page: PageDefinition): HeadData {
  // image: null —— 模板不生成 OG 图（不想为了一张图引入 satori/sharp）。
  // 需要 OG 图时在这里给 image 路径，并把图片放进 public/。
  const meta = buildPageMetadata(siteConfig, {
    path: page.path,
    title: page.title,
    description: page.description,
    live: page.live,
    image: null,
  });

  // SPA 模式没有 SEO 诉求：即使页面 live，也统一 noindex，避免 app shell 被索引。
  const indexable = renderMode === "prerender" && page.live;

  return {
    title: meta.title.absolute,
    meta: [
      { name: "description", content: meta.description },
      { name: "robots", content: indexable ? "index, follow" : "noindex, follow" },
      { property: "og:title", content: meta.openGraph.title },
      { property: "og:description", content: meta.openGraph.description },
      { property: "og:url", content: meta.openGraph.url },
      { property: "og:site_name", content: meta.openGraph.siteName },
      { property: "og:type", content: meta.openGraph.type },
      { property: "og:locale", content: meta.openGraph.locale },
    ],
    links: [{ rel: "canonical", href: meta.alternates.canonical }],
    jsonLd: page.jsonLd?.(siteConfig),
  };
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

function serializeJsonLd(data: JsonLd): string {
  // </script> 与 <!-- 都能提前关掉 script 块，统一转义成 JSON 的 \u003c。
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** 构建期用：把 HeadData 序列化成可插入 <head> 的静态标签。 */
export function renderHeadHtml(head: HeadData): string {
  const tags = [
    `<title>${escapeHtml(head.title)}</title>`,
    ...head.meta.map((tag) => {
      const attribute = tag.name ? `name="${tag.name}"` : `property="${tag.property ?? ""}"`;
      return `<meta ${attribute} content="${escapeHtml(tag.content)}" data-page-head="" />`;
    }),
    ...head.links.map(
      (link) => `<link rel="${link.rel}" href="${escapeHtml(link.href)}" data-page-head="" />`,
    ),
  ];
  if (head.jsonLd) {
    tags.push(
      `<script type="application/ld+json" data-page-head="">${serializeJsonLd(head.jsonLd)}</script>`,
    );
  }
  return tags.map((tag) => `    ${tag}`).join("\n");
}

/** 运行时用：客户端导航后把 head 同步成当前页面。 */
export function applyHead(head: HeadData): void {
  document.title = head.title;

  for (const tag of head.meta) {
    const selector = tag.name
      ? `meta[name="${CSS.escape(tag.name)}"]`
      : `meta[property="${CSS.escape(tag.property ?? "")}"]`;
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
      element = document.createElement("meta");
      if (tag.name) element.name = tag.name;
      else element.setAttribute("property", tag.property ?? "");
      element.dataset.pageHead = "";
      document.head.append(element);
    }
    element.content = tag.content;
  }

  for (const link of head.links) {
    const selector = `link[rel="${CSS.escape(link.rel)}"]`;
    let element = document.head.querySelector<HTMLLinkElement>(selector);
    if (!element) {
      element = document.createElement("link");
      element.rel = link.rel;
      element.dataset.pageHead = "";
      document.head.append(element);
    }
    element.href = link.href;
  }

  const script = document.head.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"][data-page-head]',
  );
  if (head.jsonLd) {
    const element = script ?? document.createElement("script");
    element.type = "application/ld+json";
    element.dataset.pageHead = "";
    element.textContent = serializeJsonLd(head.jsonLd);
    if (!script) document.head.append(element);
  } else {
    script?.remove();
  }
}

/** 每个页面的 route component 调一次；SSR 不执行（没有 document）。 */
export function usePageHead(page: PageDefinition): void {
  useEffect(() => {
    applyHead(buildHead(page));
  }, [page]);
}
